-- Register one Mercado Pago receipt as one or more canonical sales.
-- The provider movement is evidence of payment; products, services and
-- professionals are supplied by an administrator at approval time.

CREATE TABLE mp_sale_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id uuid NOT NULL REFERENCES mp_movements(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL UNIQUE,
  mp_amount numeric(12,2) NOT NULL CHECK (mp_amount > 0),
  sale_total numeric(12,2) NOT NULL CHECK (sale_total >= mp_amount),
  additional_payment_total numeric(12,2) NOT NULL CHECK (additional_payment_total = sale_total - mp_amount),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  reversed_at timestamptz,
  reversed_by uuid REFERENCES auth.users(id),
  CHECK ((reversed_at IS NULL) = (reversed_by IS NULL))
);

CREATE UNIQUE INDEX mp_sale_approvals_active_movement_key
  ON mp_sale_approvals(movement_id) WHERE reversed_at IS NULL;

CREATE TABLE mp_sale_approval_tickets (
  approval_id uuid NOT NULL REFERENCES mp_sale_approvals(id) ON DELETE RESTRICT,
  group_id uuid NOT NULL UNIQUE REFERENCES transaction_groups(id) ON DELETE RESTRICT,
  position integer NOT NULL CHECK (position > 0),
  PRIMARY KEY (approval_id, group_id),
  UNIQUE (approval_id, position)
);

ALTER TABLE mp_reconciliation_links
  DROP CONSTRAINT IF EXISTS mp_reconciliation_links_movement_id_key;
ALTER TABLE mp_reconciliation_links
  ADD COLUMN approval_id uuid REFERENCES mp_sale_approvals(id) ON DELETE RESTRICT,
  ADD COLUMN allocated_amount numeric(12,2) CHECK (allocated_amount IS NULL OR allocated_amount >= 0);
CREATE UNIQUE INDEX mp_reconciliation_links_movement_transaction_key
  ON mp_reconciliation_links(movement_id, transaction_id);

ALTER TABLE mp_sale_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE mp_sale_approval_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read mp_sale_approvals"
  ON mp_sale_approvals FOR SELECT TO authenticated USING (integrations_is_admin());
CREATE POLICY "admin read mp_sale_approval_tickets"
  ON mp_sale_approval_tickets FOR SELECT TO authenticated USING (integrations_is_admin());
REVOKE ALL ON mp_sale_approvals, mp_sale_approval_tickets FROM anon, authenticated;
GRANT SELECT ON mp_sale_approvals, mp_sale_approval_tickets TO authenticated;


CREATE OR REPLACE FUNCTION reject_mp_sale_group_member_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM mp_sale_approval_tickets WHERE group_id = NEW.group_id) THEN
      RAISE EXCEPTION 'Este ticket pertenece a una venta de Mercado Pago y debe gestionarse desde esa aprobación.';
    END IF;
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM mp_sale_approval_tickets WHERE group_id = OLD.group_id)
     OR (TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM mp_sale_approval_tickets WHERE group_id = NEW.group_id)) THEN
    RAISE EXCEPTION 'Este ticket pertenece a una venta de Mercado Pago y debe gestionarse desde esa aprobación.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reject_mp_sale_group_member_mutation
BEFORE INSERT OR UPDATE OR DELETE ON transaction_group_members
FOR EACH ROW EXECUTE FUNCTION reject_mp_sale_group_member_mutation();
REVOKE ALL ON FUNCTION reject_mp_sale_group_member_mutation() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION publish_mp_sales(
  p_movement_id uuid,
  p_idempotency_key uuid,
  p_tickets jsonb,
  p_additional_payments jsonb DEFAULT '[]'::jsonb,
  p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement mp_movements%ROWTYPE;
  v_existing mp_sale_approvals%ROWTYPE;
  v_approval_id uuid;
  v_service_category uuid;
  v_product_category uuid;
  v_mp_method text;
  v_lines jsonb := '[]'::jsonb;
  v_methods jsonb;
  v_ticket jsonb;
  v_line jsonb;
  v_prof jsonb;
  v_payment jsonb;
  v_line_total numeric(12,2);
  v_sale_total numeric(12,2) := 0;
  v_extra_total numeric(12,2) := 0;
  v_mp_amount numeric(12,2);
  v_ticket_position integer := 0;
  v_line_count integer := 0;
  v_line_index integer;
  v_group_id uuid;
  v_tx_id uuid;
  v_result jsonb;
  v_ticket_result jsonb := '[]'::jsonb;
  v_transaction_ids jsonb := '[]'::jsonb;
  v_unit_payments jsonb;
  v_method_count integer;
  v_method_index integer;
  v_method_amount numeric(12,2);
  v_alloc numeric(12,2);
  v_total_cents bigint;
  v_line_cents bigint;
  v_method_cents bigint;
  v_alloc_cents bigint;
  v_row_remaining bigint;
  v_column_remaining bigint;
  v_delta_cents bigint;
  v_mp_alloc numeric(12,2);
  v_group_label text;
  v_ticket_tx_ids jsonb;
  v_ticket_total numeric(12,2);
  v_kind text;
  v_quantity numeric;
  v_unit_price numeric(12,2);
  v_without_professional boolean;
  v_catalog_item_id uuid;
  v_product_id uuid;
  v_client_uuid uuid;
BEGIN
  IF NOT integrations_is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede registrar ventas de Mercado Pago.';
  END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'La clave de idempotencia es obligatoria.'; END IF;

  SELECT * INTO v_existing FROM mp_sale_approvals WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.movement_id IS DISTINCT FROM p_movement_id THEN
      RAISE EXCEPTION 'La clave de idempotencia pertenece a otro movimiento.';
    END IF;
    SELECT jsonb_build_object(
      'approvalId', v_existing.id,
      'movementId', v_existing.movement_id,
      'mpAmount', v_existing.mp_amount,
      'saleTotal', v_existing.sale_total,
      'additionalPaymentTotal', v_existing.additional_payment_total,
      'tickets', COALESCE(jsonb_agg(jsonb_build_object(
        'groupId', ticket.group_id,
        'label', sale_group.label,
        'total', (SELECT COALESCE(sum(transaction_row.amount), 0) FROM transaction_group_members member JOIN transactions transaction_row ON transaction_row.id = member.transaction_id WHERE member.group_id = ticket.group_id),
        'transactionIds', (SELECT COALESCE(jsonb_agg(member.transaction_id ORDER BY member.created_at), '[]'::jsonb) FROM transaction_group_members member WHERE member.group_id = ticket.group_id)
      ) ORDER BY ticket.position), '[]'::jsonb),
      'transactionIds', COALESCE((SELECT jsonb_agg(link.transaction_id ORDER BY link.reconciled_at, link.id) FROM mp_reconciliation_links link WHERE link.approval_id = v_existing.id), '[]'::jsonb)
    ) INTO v_result
    FROM mp_sale_approval_tickets ticket
    JOIN transaction_groups sale_group ON sale_group.id = ticket.group_id
    WHERE ticket.approval_id = v_existing.id;
    RETURN v_result;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_movement_id::text, 106));
  -- A concurrent retry can only become visible after the movement lock is
  -- acquired, so repeat the idempotency lookup inside the serialized section.
  SELECT * INTO v_existing FROM mp_sale_approvals WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existing.movement_id IS DISTINCT FROM p_movement_id THEN
      RAISE EXCEPTION 'La clave de idempotencia pertenece a otro movimiento.';
    END IF;
    SELECT jsonb_build_object(
      'approvalId', v_existing.id,
      'movementId', v_existing.movement_id,
      'mpAmount', v_existing.mp_amount,
      'saleTotal', v_existing.sale_total,
      'additionalPaymentTotal', v_existing.additional_payment_total,
      'tickets', COALESCE(jsonb_agg(jsonb_build_object(
        'groupId', ticket.group_id,
        'label', sale_group.label,
        'total', (SELECT COALESCE(sum(transaction_row.amount), 0) FROM transaction_group_members member JOIN transactions transaction_row ON transaction_row.id = member.transaction_id WHERE member.group_id = ticket.group_id),
        'transactionIds', (SELECT COALESCE(jsonb_agg(member.transaction_id ORDER BY member.created_at), '[]'::jsonb) FROM transaction_group_members member WHERE member.group_id = ticket.group_id)
      ) ORDER BY ticket.position), '[]'::jsonb),
      'transactionIds', COALESCE((SELECT jsonb_agg(link.transaction_id ORDER BY link.reconciled_at, link.id) FROM mp_reconciliation_links link WHERE link.approval_id = v_existing.id), '[]'::jsonb)
    ) INTO v_result
    FROM mp_sale_approval_tickets ticket
    JOIN transaction_groups sale_group ON sale_group.id = ticket.group_id
    WHERE ticket.approval_id = v_existing.id;
    RETURN v_result;
  END IF;
  SELECT * INTO v_movement FROM mp_movements WHERE id = p_movement_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El movimiento de Mercado Pago no existe.'; END IF;
  IF v_movement.status <> 'pending' THEN RAISE EXCEPTION 'El movimiento ya fue procesado.'; END IF;
  IF v_movement.suggested_classification <> 'received_payment' OR v_movement.amount <= 0 OR v_movement.currency <> 'ARS' THEN
    RAISE EXCEPTION 'Solo los cobros recibidos positivos en ARS pueden registrarse como ventas.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM locked_periods
    WHERE year = extract(year FROM v_movement.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')
      AND month = extract(month FROM v_movement.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')
  ) THEN RAISE EXCEPTION 'El período contable del movimiento está cerrado.'; END IF;
  IF p_tickets IS NULL OR jsonb_typeof(p_tickets) <> 'array' OR jsonb_array_length(p_tickets) = 0 THEN
    RAISE EXCEPTION 'Agregá al menos una venta.';
  END IF;
  IF p_additional_payments IS NULL OR jsonb_typeof(p_additional_payments) <> 'array' THEN
    RAISE EXCEPTION 'Los medios de pago adicionales no son válidos.';
  END IF;

  SELECT name INTO v_mp_method FROM payment_methods
  WHERE active AND lower(name) = lower('Mercado Pago') LIMIT 1;
  IF v_mp_method IS NULL THEN RAISE EXCEPTION 'Configurá el método de pago Mercado Pago antes de registrar ventas.'; END IF;

  SELECT child.id INTO v_service_category
  FROM transaction_categories child
  JOIN transaction_categories parent ON parent.id = child.parent_id
  WHERE lower(parent.name) = 'ingresos' AND lower(child.name) = 'servicio'
    AND child.transaction_type = 'income' LIMIT 1;
  SELECT child.id INTO v_product_category
  FROM transaction_categories child
  JOIN transaction_categories parent ON parent.id = child.parent_id
  WHERE lower(parent.name) = 'ingresos' AND lower(child.name) IN ('producto', 'productos (retail)')
    AND child.transaction_type = 'income'
  ORDER BY CASE lower(child.name) WHEN 'producto' THEN 0 ELSE 1 END LIMIT 1;
  IF v_service_category IS NULL OR v_product_category IS NULL THEN
    RAISE EXCEPTION 'Configurá las categorías de ingreso Servicio y Producto antes de registrar ventas.';
  END IF;

  FOR v_ticket IN SELECT value FROM jsonb_array_elements(p_tickets)
  LOOP
    v_ticket_position := v_ticket_position + 1;
    IF jsonb_typeof(v_ticket->'lines') <> 'array' OR jsonb_array_length(v_ticket->'lines') = 0 THEN
      RAISE EXCEPTION 'La venta % no tiene productos ni servicios.', v_ticket_position;
    END IF;
    FOR v_line IN SELECT value FROM jsonb_array_elements(v_ticket->'lines')
    LOOP
      v_kind := v_line->>'kind';
      v_quantity := COALESCE((v_line->>'quantity')::numeric, 0);
      v_unit_price := round(COALESCE((v_line->>'unitPrice')::numeric, 0), 2);
      v_client_uuid := NULLIF(v_line->>'clientUuid', '')::uuid;
      IF v_client_uuid IS NULL OR v_kind NOT IN ('service', 'product') OR v_quantity <= 0 OR v_unit_price <= 0 THEN
        RAISE EXCEPTION 'La venta % contiene una línea inválida.', v_ticket_position;
      END IF;
      IF v_kind = 'service' THEN
        IF v_quantity <> 1 THEN RAISE EXCEPTION 'Cada servicio debe registrarse como una ocurrencia separada.'; END IF;
        v_catalog_item_id := NULLIF(v_line->>'catalogItemId', '')::uuid;
        IF v_catalog_item_id IS NULL OR NOT EXISTS (SELECT 1 FROM catalog_items WHERE id = v_catalog_item_id) THEN
          RAISE EXCEPTION 'La venta % contiene un servicio inexistente.', v_ticket_position;
        END IF;
        IF COALESCE(jsonb_typeof(v_line->'professionals'), 'null') <> 'array' THEN
          RAISE EXCEPTION 'Los profesionales del servicio no son válidos.';
        END IF;
        v_without_professional := COALESCE((v_line->>'withoutProfessional')::boolean, false);
        IF jsonb_array_length(v_line->'professionals') = 0 AND NOT v_without_professional THEN
          RAISE EXCEPTION 'Elegí un profesional o confirmá que el servicio no genera comisión.';
        END IF;
        FOR v_prof IN SELECT value FROM jsonb_array_elements(v_line->'professionals')
        LOOP
          IF NOT EXISTS (
            SELECT 1 FROM hairdressers
            WHERE id = NULLIF(v_prof->>'hairdresserId', '')::uuid AND active
          ) OR COALESCE((v_prof->>'commissionRate')::numeric, -1) < 0
             OR COALESCE((v_prof->>'commissionRate')::numeric, 101) > 100 THEN
            RAISE EXCEPTION 'La venta % contiene un profesional o comisión inválidos.', v_ticket_position;
          END IF;
        END LOOP;
        v_product_id := NULL;
      ELSE
        v_product_id := NULLIF(v_line->>'productId', '')::uuid;
        IF v_product_id IS NULL OR NOT EXISTS (SELECT 1 FROM products WHERE id = v_product_id AND deleted_at IS NULL) THEN
          RAISE EXCEPTION 'La venta % contiene un producto inexistente.', v_ticket_position;
        END IF;
        v_catalog_item_id := NULL;
      END IF;
      v_line_total := round(v_quantity * v_unit_price, 2);
      v_sale_total := v_sale_total + v_line_total;
      v_line_count := v_line_count + 1;
      v_lines := v_lines || jsonb_build_array(v_line || jsonb_build_object(
        'ticketPosition', v_ticket_position,
        'lineIndex', v_line_count,
        'lineTotal', v_line_total,
        'quantity', v_quantity,
        'unitPrice', v_unit_price
      ));
    END LOOP;
  END LOOP;

  v_mp_amount := round(v_movement.amount, 2);
  FOR v_payment IN SELECT value FROM jsonb_array_elements(p_additional_payments)
  LOOP
    v_method_amount := round(COALESCE((v_payment->>'amount')::numeric, 0), 2);
    IF NULLIF(btrim(v_payment->>'paymentMethod'), '') IS NULL OR v_method_amount <= 0
       OR lower(v_payment->>'paymentMethod') = lower(v_mp_method)
       OR NOT EXISTS (SELECT 1 FROM payment_methods WHERE active AND name = v_payment->>'paymentMethod') THEN
      RAISE EXCEPTION 'Todos los pagos adicionales deben usar un medio activo distinto de Mercado Pago.';
    END IF;
    v_extra_total := v_extra_total + v_method_amount;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_additional_payments) payment
    GROUP BY lower(payment->>'paymentMethod') HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Un medio de pago adicional no puede repetirse.'; END IF;
  IF v_sale_total < v_mp_amount THEN
    RAISE EXCEPTION 'Faltan asignar % a productos o servicios.', v_mp_amount - v_sale_total;
  END IF;
  IF v_extra_total <> v_sale_total - v_mp_amount THEN
    RAISE EXCEPTION 'Los pagos adicionales deben cubrir exactamente la diferencia de %.', v_sale_total - v_mp_amount;
  END IF;

  -- Lock every relevant lot before validating aggregate quantities. This keeps
  -- repeated product lines from silently becoming inventory_pending.
  PERFORM lot.id
  FROM inventory_lots lot
  WHERE lot.product_id IN (
    SELECT DISTINCT NULLIF(line->>'productId', '')::uuid
    FROM jsonb_array_elements(v_lines) line WHERE line->>'kind' = 'product'
  ) AND lot.remaining_quantity > 0
  ORDER BY lot.product_id, lot.received_date, lot.id
  FOR UPDATE;
  IF EXISTS (
    SELECT requested.product_id
    FROM (
      SELECT NULLIF(line->>'productId', '')::uuid product_id,
             sum((line->>'quantity')::numeric) quantity
      FROM jsonb_array_elements(v_lines) line
      WHERE line->>'kind' = 'product'
      GROUP BY 1
    ) requested
    LEFT JOIN products_with_stock stock ON stock.id = requested.product_id
    WHERE COALESCE(stock.stock, 0) < requested.quantity
  ) THEN RAISE EXCEPTION 'No hay stock suficiente para registrar todos los productos.'; END IF;

  INSERT INTO mp_sale_approvals(
    movement_id, idempotency_key, mp_amount, sale_total,
    additional_payment_total, notes, created_by
  ) VALUES (
    p_movement_id, p_idempotency_key, v_mp_amount, v_sale_total,
    v_extra_total, NULLIF(btrim(p_notes), ''), auth.uid()
  ) RETURNING id INTO v_approval_id;

  v_methods := jsonb_build_array(jsonb_build_object('paymentMethod', v_mp_method, 'amount', v_mp_amount)) || p_additional_payments;
  v_method_count := jsonb_array_length(v_methods);

  -- Allocate in integer cents. The proportional floor provides a stable base;
  -- the deterministic residual pass then satisfies every row and payment-method
  -- total simultaneously, including very small multi-method amounts.
  DROP TABLE IF EXISTS pg_temp.mp_sale_payment_allocation;
  CREATE TEMP TABLE pg_temp.mp_sale_payment_allocation (
    line_index integer NOT NULL,
    method_index integer NOT NULL,
    amount_cents bigint NOT NULL,
    PRIMARY KEY (line_index, method_index)
  ) ON COMMIT DROP;
  v_total_cents := round(v_sale_total * 100)::bigint;

  FOR v_line_index IN 1..v_line_count LOOP
    v_line_cents := round(((v_lines->(v_line_index - 1)->>'lineTotal')::numeric) * 100)::bigint;
    FOR v_method_index IN 1..v_method_count LOOP
      v_method_cents := round(((v_methods->(v_method_index - 1)->>'amount')::numeric) * 100)::bigint;
      INSERT INTO pg_temp.mp_sale_payment_allocation(line_index, method_index, amount_cents)
      VALUES (
        v_line_index,
        v_method_index,
        floor((v_line_cents::numeric * v_method_cents::numeric) / v_total_cents)::bigint
      );
    END LOOP;
  END LOOP;

  FOR v_line_index IN 1..v_line_count LOOP
    v_line_cents := round(((v_lines->(v_line_index - 1)->>'lineTotal')::numeric) * 100)::bigint;
    SELECT v_line_cents - sum(amount_cents)
    INTO v_row_remaining
    FROM pg_temp.mp_sale_payment_allocation
    WHERE line_index = v_line_index;

    FOR v_method_index IN 1..v_method_count LOOP
      EXIT WHEN v_row_remaining = 0;
      v_method_cents := round(((v_methods->(v_method_index - 1)->>'amount')::numeric) * 100)::bigint;
      SELECT v_method_cents - sum(amount_cents)
      INTO v_column_remaining
      FROM pg_temp.mp_sale_payment_allocation
      WHERE method_index = v_method_index;
      v_delta_cents := LEAST(v_row_remaining, v_column_remaining);
      IF v_delta_cents > 0 THEN
        UPDATE pg_temp.mp_sale_payment_allocation
        SET amount_cents = amount_cents + v_delta_cents
        WHERE line_index = v_line_index AND method_index = v_method_index;
        v_row_remaining := v_row_remaining - v_delta_cents;
      END IF;
    END LOOP;
    IF v_row_remaining <> 0 THEN
      RAISE EXCEPTION 'No se pudo distribuir completamente una línea de venta.';
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM generate_series(1, v_method_count) AS method_row(method_index)
    WHERE (
      SELECT sum(amount_cents)
      FROM pg_temp.mp_sale_payment_allocation allocation
      WHERE allocation.method_index = method_row.method_index
    ) <> round(((v_methods->(method_row.method_index - 1)->>'amount')::numeric) * 100)::bigint
  ) THEN
    RAISE EXCEPTION 'La distribución final de medios de pago no coincide con sus importes.';
  END IF;

  v_ticket_position := 0;
  v_line_index := 0;

  FOR v_ticket IN SELECT value FROM jsonb_array_elements(p_tickets)
  LOOP
    v_ticket_position := v_ticket_position + 1;
    v_group_label := COALESCE(NULLIF(btrim(v_ticket->>'label'), ''), 'Venta Mercado Pago · MP ' || v_movement.external_id);
    INSERT INTO transaction_groups(label, currency, created_by)
    VALUES (v_group_label, 'ARS', auth.uid()) RETURNING id INTO v_group_id;
    v_ticket_tx_ids := '[]'::jsonb;
    v_ticket_total := 0;

    FOR v_line IN
      SELECT value FROM jsonb_array_elements(v_lines)
      WHERE (value->>'ticketPosition')::integer = v_ticket_position
    LOOP
      v_line_index := v_line_index + 1;
      v_line_total := (v_line->>'lineTotal')::numeric;
      v_unit_payments := '[]'::jsonb;
      v_mp_alloc := 0;

      FOR v_method_index IN 1..v_method_count LOOP
        v_payment := v_methods->(v_method_index - 1);
        SELECT amount_cents INTO v_alloc_cents
        FROM pg_temp.mp_sale_payment_allocation
        WHERE line_index = v_line_index AND method_index = v_method_index;
        v_alloc := v_alloc_cents::numeric / 100;
        IF v_method_index = 1 THEN v_mp_alloc := v_alloc; END IF;
        IF v_alloc > 0 THEN
          v_unit_payments := v_unit_payments || jsonb_build_array(jsonb_build_object(
            'payment_method', v_payment->>'paymentMethod', 'instrument', NULL,
            'amount', v_alloc
          ));
        END IF;
      END LOOP;

      v_result := create_funnel_unit(
        NULLIF(v_line->>'clientUuid', '')::uuid,
        (v_movement.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
        'income', 'ARS',
        CASE WHEN v_line->>'kind' = 'service' THEN v_service_category ELSE v_product_category END,
        CASE WHEN v_line->>'kind' = 'service' THEN 'Servicio' ELSE 'Producto' END,
        NULLIF(v_line->>'catalogItemId', '')::uuid,
        COALESCE(NULLIF(v_line->>'description', ''),
          CASE WHEN v_line->>'kind' = 'service'
            THEN (SELECT name FROM catalog_items WHERE id = NULLIF(v_line->>'catalogItemId', '')::uuid)
            ELSE (SELECT name FROM products WHERE id = NULLIF(v_line->>'productId', '')::uuid)
          END),
        NULL, v_unit_payments,
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'hairdresser_id', professional->>'hairdresserId',
          'commission_rate', (professional->>'commissionRate')::numeric
        )) FROM jsonb_array_elements(COALESCE(v_line->'professionals', '[]'::jsonb)) professional), '[]'::jsonb),
        NULLIF(v_line->>'productId', '')::uuid,
        CASE WHEN v_line->>'kind' = 'product' THEN (v_line->>'quantity')::numeric ELSE 0 END,
        (v_line->>'unitPrice')::numeric,
        NULL, auth.uid()
      );
      v_tx_id := NULLIF(v_result->>'transaction_id', '')::uuid;
      IF v_tx_id IS NULL THEN RAISE EXCEPTION 'No se pudo confirmar la transacción creada.'; END IF;

      INSERT INTO transaction_group_members(group_id, transaction_id) VALUES (v_group_id, v_tx_id);
      INSERT INTO mp_reconciliation_links(
        movement_id, transaction_id, classification, reconciled_by, notes,
        approval_id, allocated_amount
      ) VALUES (
        p_movement_id, v_tx_id, 'received_payment', auth.uid(), NULLIF(btrim(p_notes), ''),
        v_approval_id, v_mp_alloc
      );
      v_ticket_tx_ids := v_ticket_tx_ids || to_jsonb(v_tx_id);
      v_transaction_ids := v_transaction_ids || to_jsonb(v_tx_id);
      v_ticket_total := v_ticket_total + v_line_total;
    END LOOP;
    INSERT INTO mp_sale_approval_tickets(approval_id, group_id, position)
    VALUES (v_approval_id, v_group_id, v_ticket_position);
    v_ticket_result := v_ticket_result || jsonb_build_array(jsonb_build_object(
      'groupId', v_group_id, 'label', v_group_label,
      'total', v_ticket_total, 'transactionIds', v_ticket_tx_ids
    ));
  END LOOP;

  UPDATE mp_movements
  SET status = 'reconciled', suggested_classification = 'received_payment', updated_at = now()
  WHERE id = p_movement_id;

  RETURN jsonb_build_object(
    'approvalId', v_approval_id, 'movementId', p_movement_id,
    'mpAmount', v_mp_amount, 'saleTotal', v_sale_total,
    'additionalPaymentTotal', v_extra_total,
    'tickets', v_ticket_result, 'transactionIds', v_transaction_ids
  );
END;
$$;

REVOKE ALL ON FUNCTION publish_mp_sales(uuid, uuid, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION publish_mp_sales(uuid, uuid, jsonb, jsonb, text) TO authenticated;

CREATE OR REPLACE FUNCTION reverse_mp_sale_approval(p_approval_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approval mp_sale_approvals%ROWTYPE;
  v_transaction_id uuid;
  v_transaction_ids jsonb := '[]'::jsonb;
BEGIN
  IF NOT integrations_is_admin() THEN RAISE EXCEPTION 'Solo un administrador puede revertir ventas de Mercado Pago.'; END IF;
  SELECT * INTO v_approval FROM mp_sale_approvals WHERE id = p_approval_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La aprobación no existe.'; END IF;
  IF v_approval.reversed_at IS NOT NULL THEN
    RETURN jsonb_build_object('approvalId', v_approval.id, 'alreadyReversed', true);
  END IF;
  IF EXISTS (
    SELECT 1 FROM mp_reconciliation_links link
    JOIN transactions transaction_row ON transaction_row.id = link.transaction_id
    JOIN locked_periods period ON period.year = extract(year FROM transaction_row.date)
      AND period.month = extract(month FROM transaction_row.date)
    WHERE link.approval_id = v_approval.id
  ) THEN RAISE EXCEPTION 'El período contable de una venta está cerrado.'; END IF;
  IF EXISTS (
    SELECT 1 FROM mp_reconciliation_links link
    JOIN fiscal_document_transactions fiscal_link ON fiscal_link.transaction_id = link.transaction_id
    WHERE link.approval_id = v_approval.id
  ) THEN RAISE EXCEPTION 'Las ventas tienen un comprobante fiscal. Resolvelo antes de revertir la aprobación.'; END IF;

  FOR v_transaction_id IN
    SELECT link.transaction_id FROM mp_reconciliation_links link
    WHERE link.approval_id = v_approval.id ORDER BY link.transaction_id FOR UPDATE
  LOOP
    PERFORM void_transaction(v_transaction_id);
    v_transaction_ids := v_transaction_ids || to_jsonb(v_transaction_id);
  END LOOP;
  UPDATE mp_sale_approvals SET reversed_at = now(), reversed_by = auth.uid() WHERE id = v_approval.id;
  UPDATE mp_movements SET status = 'pending', updated_at = now() WHERE id = v_approval.movement_id;
  RETURN jsonb_build_object('approvalId', v_approval.id, 'alreadyReversed', false, 'transactionIds', v_transaction_ids);
END;
$$;

REVOKE ALL ON FUNCTION reverse_mp_sale_approval(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reverse_mp_sale_approval(uuid) TO authenticated;

-- Received payments now have exactly one creation path. Other classifications
-- retain the assisted reconciliation behavior.
CREATE OR REPLACE FUNCTION publish_mp_reconciliation(
  p_movement_id uuid, p_classification text, p_existing_transaction_id uuid DEFAULT NULL,
  p_subcategory_id uuid DEFAULT NULL, p_destination_payment_method text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement mp_movements%ROWTYPE;
  v_tx_id uuid;
  v_amount numeric(12,2);
  v_transfer_category uuid;
BEGIN
  IF NOT integrations_is_admin() THEN RAISE EXCEPTION 'Solo un administrador puede conciliar movimientos.'; END IF;
  IF p_classification = 'received_payment' THEN
    RAISE EXCEPTION 'Los cobros recibidos deben registrarse como ventas desde Transacciones > Mercado Pago.';
  END IF;
  SELECT * INTO v_movement FROM mp_movements WHERE id = p_movement_id FOR UPDATE;
  IF NOT FOUND OR v_movement.status <> 'pending' THEN RAISE EXCEPTION 'El movimiento ya fue procesado o no existe.'; END IF;
  IF EXISTS (SELECT 1 FROM locked_periods WHERE year = extract(year FROM v_movement.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires') AND month = extract(month FROM v_movement.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')) THEN
    RAISE EXCEPTION 'El período contable del movimiento está cerrado.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE lower(name) = lower('Mercado Pago') AND active) THEN RAISE EXCEPTION 'Configurá el método de pago Mercado Pago antes de conciliar.'; END IF;
  v_amount := abs(v_movement.amount);

  IF p_classification = 'withdrawal' THEN
    IF p_destination_payment_method IS NULL OR lower(p_destination_payment_method) = lower('Mercado Pago') THEN RAISE EXCEPTION 'Elegí la cuenta de destino del retiro.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE name = p_destination_payment_method AND active) THEN RAISE EXCEPTION 'La cuenta de destino no existe o está inactiva.'; END IF;
    SELECT id INTO v_transfer_category FROM transaction_categories WHERE lower(name) = lower('Transferencia interna') LIMIT 1;
    IF v_transfer_category IS NULL THEN RAISE EXCEPTION 'Falta la categoría Transferencia interna.'; END IF;
    INSERT INTO transactions(date, amount, currency, subcategory_id, description, created_by)
    VALUES ((v_movement.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, v_amount, 'ARS', v_transfer_category, COALESCE(p_notes, v_movement.description, 'Retiro de Mercado Pago'), auth.uid()) RETURNING id INTO v_tx_id;
    INSERT INTO transaction_payments(transaction_id, payment_method, amount, type) VALUES
      (v_tx_id, 'Mercado Pago', v_amount, 'salida'),
      (v_tx_id, p_destination_payment_method, v_amount, 'entrada');
  ELSIF p_classification IN ('fee', 'tax', 'withholding', 'refund', 'chargeback') THEN
    IF p_subcategory_id IS NULL THEN RAISE EXCEPTION 'Elegí una categoría contable.'; END IF;
    IF NOT EXISTS (SELECT 1 FROM transaction_categories WHERE id = p_subcategory_id AND transaction_type = 'expense') THEN RAISE EXCEPTION 'La categoría debe ser un egreso.'; END IF;
    INSERT INTO transactions(date, amount, currency, subcategory_id, description, created_by)
    VALUES ((v_movement.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date, v_amount, 'ARS', p_subcategory_id, COALESCE(p_notes, v_movement.description, 'Movimiento de Mercado Pago'), auth.uid()) RETURNING id INTO v_tx_id;
    INSERT INTO transaction_payments(transaction_id, payment_method, amount, type)
    VALUES (v_tx_id, 'Mercado Pago', v_amount, 'salida');
  ELSE
    RAISE EXCEPTION 'Clasificación no publicable. Los movimientos desconocidos deben permanecer pendientes.';
  END IF;

  INSERT INTO mp_reconciliation_links(movement_id, transaction_id, classification, reconciled_by, notes)
  VALUES (p_movement_id, v_tx_id, p_classification, auth.uid(), p_notes);
  UPDATE mp_movements SET status = 'reconciled', suggested_classification = p_classification, updated_at = now() WHERE id = p_movement_id;
  RETURN v_tx_id;
END;
$$;
REVOKE ALL ON FUNCTION publish_mp_reconciliation(uuid, text, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION publish_mp_reconciliation(uuid, text, uuid, uuid, text, text) TO authenticated;
