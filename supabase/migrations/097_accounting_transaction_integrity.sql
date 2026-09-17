-- ============================================================
-- Accounting transaction integrity.
--
-- Account balances are derived exclusively from transaction_payments. Domain
-- rows own their mirror transactions, and every multi-table accounting write
-- added here is atomic. Historical repairs are intentionally limited to states
-- that can be proven from the ledger itself; ambiguous business corrections
-- remain untouched for manual reconciliation.
-- ============================================================

-- 1. Normalize duplicate payment keys, then prevent recurrence. -------------

DO $repair_duplicate_payments$
DECLARE
  v_tx record;
  v_group record;
  v_key_count integer;
  v_every_row_matches_header boolean;
BEGIN
  FOR v_tx IN
    SELECT t.id, t.amount AS header_amount, sum(tp.amount) AS payment_total
    FROM transactions t
    JOIN transaction_payments tp ON tp.transaction_id = t.id
    WHERE t.id IN (
      SELECT transaction_id
      FROM transaction_payments
      GROUP BY transaction_id, payment_method, type
      HAVING count(*) > 1
    )
    GROUP BY t.id, t.amount
  LOOP
    IF abs(v_tx.payment_total - v_tx.header_amount) <= 0.01 THEN
      FOR v_group IN
        SELECT payment_method, type, sum(amount) AS total_amount,
               count(DISTINCT COALESCE(instrument, '')) AS instrument_count
        FROM transaction_payments
        WHERE transaction_id = v_tx.id
        GROUP BY payment_method, type
        HAVING count(*) > 1
      LOOP
        IF v_group.instrument_count > 1 THEN
          RAISE EXCEPTION 'La transacción % tiene pagos repetidos con instrumentos distintos; requiere conciliación manual.', v_tx.id;
        END IF;

        UPDATE transaction_payments
        SET amount = v_group.total_amount
        WHERE id = (
          SELECT id
          FROM transaction_payments
          WHERE transaction_id = v_tx.id
            AND payment_method = v_group.payment_method
            AND type = v_group.type
          ORDER BY created_at, id
          LIMIT 1
        );

        DELETE FROM transaction_payments
        WHERE transaction_id = v_tx.id
          AND payment_method = v_group.payment_method
          AND type = v_group.type
          AND id <> (
            SELECT id
            FROM transaction_payments
            WHERE transaction_id = v_tx.id
              AND payment_method = v_group.payment_method
              AND type = v_group.type
            ORDER BY created_at, id
            LIMIT 1
          );
      END LOOP;
    ELSE
      SELECT count(DISTINCT (payment_method, type)),
             bool_and(abs(amount - v_tx.header_amount) <= 0.01)
      INTO v_key_count, v_every_row_matches_header
      FROM transaction_payments
      WHERE transaction_id = v_tx.id;

      IF v_key_count = 1 AND v_every_row_matches_header THEN
        DELETE FROM transaction_payments
        WHERE transaction_id = v_tx.id
          AND id <> (
            SELECT id
            FROM transaction_payments
            WHERE transaction_id = v_tx.id
            ORDER BY created_at, id
            LIMIT 1
          );
      ELSE
        RAISE EXCEPTION 'La transacción % tiene pagos repetidos ambiguos (cabecera %, pagos %). Requiere conciliación manual.',
          v_tx.id, v_tx.header_amount, v_tx.payment_total;
      END IF;
    END IF;
  END LOOP;
END
$repair_duplicate_payments$;

CREATE UNIQUE INDEX IF NOT EXISTS transaction_payments_transaction_method_type_key
  ON transaction_payments (transaction_id, payment_method, type);

-- 2. Domain ownership and defensive mutation guards. ------------------------

CREATE OR REPLACE FUNCTION transaction_managed_source(p_transaction_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM commission_payouts WHERE paid_via_transaction_id = p_transaction_id) THEN 'liquidación de comisiones'
    WHEN EXISTS (SELECT 1 FROM supplier_debt_payments WHERE transaction_id = p_transaction_id) THEN 'pago de deuda a proveedor'
    WHEN EXISTS (SELECT 1 FROM purchase_orders WHERE payment_transaction_id = p_transaction_id) THEN 'pago de orden de compra'
    WHEN EXISTS (SELECT 1 FROM receivables WHERE source_transaction_id = p_transaction_id) THEN 'origen de cuenta por cobrar'
    WHEN EXISTS (SELECT 1 FROM receivable_collections WHERE transaction_id = p_transaction_id) THEN 'cobranza de cuenta por cobrar'
    WHEN EXISTS (SELECT 1 FROM reserve_movements WHERE transaction_id = p_transaction_id) THEN 'movimiento de reserva'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION assert_transaction_is_unmanaged(p_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source text;
BEGIN
  v_source := transaction_managed_source(p_transaction_id);
  IF v_source IS NOT NULL THEN
    RAISE EXCEPTION 'Esta transacción pertenece a % y debe modificarse desde ese módulo.', v_source;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION reject_managed_transaction_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('erp.allow_managed_mirror_update', true) = 'true' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  PERFORM assert_transaction_is_unmanaged(OLD.id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_managed_transaction_update ON transactions;
CREATE TRIGGER trg_reject_managed_transaction_update
BEFORE UPDATE OF date, amount, currency, subcategory_id, catalog_item_id,
  description, is_seña, seña_amount, refunds_anticipo_id, product_id,
  inventory_pending
ON transactions
FOR EACH ROW
EXECUTE FUNCTION reject_managed_transaction_mutation();

DROP TRIGGER IF EXISTS trg_reject_managed_transaction_delete ON transactions;
CREATE TRIGGER trg_reject_managed_transaction_delete
BEFORE DELETE ON transactions
FOR EACH ROW
EXECUTE FUNCTION reject_managed_transaction_mutation();

CREATE OR REPLACE FUNCTION reject_managed_payment_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_id uuid;
BEGIN
  IF current_setting('erp.allow_managed_mirror_update', true) = 'true' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  v_transaction_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.transaction_id ELSE NEW.transaction_id END;
  PERFORM assert_transaction_is_unmanaged(v_transaction_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_managed_payment_mutation ON transaction_payments;
CREATE TRIGGER trg_reject_managed_payment_mutation
BEFORE INSERT OR UPDATE OR DELETE ON transaction_payments
FOR EACH ROW
EXECUTE FUNCTION reject_managed_payment_mutation();

-- 3. Atomic editing for ordinary transactions. ------------------------------

-- Payment directions are part of the payload only for the category named
-- "Transferencia interna". Other movement categories keep their legacy
-- single-direction payload and derive every ledger leg from that direction.
CREATE OR REPLACE FUNCTION validated_transaction_payment_total(
  p_transaction_type text,
  p_payments jsonb,
  p_require_payment boolean,
  p_is_internal_transfer boolean
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric(12,2);
BEGIN
  IF p_transaction_type NOT IN ('income', 'expense', 'transfer')
     OR p_payments IS NULL
     OR jsonb_typeof(p_payments) <> 'array' THEN
    RAISE EXCEPTION 'El tipo o los pagos de la transacción no son válidos.';
  END IF;

  IF p_require_payment AND jsonb_array_length(p_payments) = 0 THEN
    RAISE EXCEPTION 'La transacción debe tener al menos un pago.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payments) p
    WHERE NULLIF(p->>'payment_method', '') IS NULL
       OR COALESCE((p->>'amount')::numeric, 0) <= 0
       OR NOT EXISTS (
         SELECT 1 FROM payment_methods pm
         WHERE pm.active = true AND pm.name = p->>'payment_method'
       )
  ) THEN
    RAISE EXCEPTION 'Todos los pagos deben tener un método activo y un importe mayor que cero.';
  END IF;

  IF p_is_internal_transfer THEN
    IF p_transaction_type <> 'transfer' THEN
      RAISE EXCEPTION 'La categoría de transferencia interna debe ser de tipo transferencia.';
    END IF;

    IF jsonb_array_length(p_payments) <> 2
       OR (SELECT count(*) FROM jsonb_array_elements(p_payments) p WHERE p->>'type' = 'salida') <> 1
       OR (SELECT count(*) FROM jsonb_array_elements(p_payments) p WHERE p->>'type' = 'entrada') <> 1
       OR (SELECT count(DISTINCT lower(p->>'payment_method')) FROM jsonb_array_elements(p_payments) p) <> 2
       OR (SELECT count(DISTINCT round((p->>'amount')::numeric, 2)) FROM jsonb_array_elements(p_payments) p) <> 1 THEN
      RAISE EXCEPTION 'La transferencia requiere una salida y una entrada del mismo importe entre cuentas distintas.';
    END IF;

    SELECT round((p->>'amount')::numeric, 2)
    INTO v_amount
    FROM jsonb_array_elements(p_payments) p
    WHERE p->>'type' = 'salida';
    RETURN v_amount;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payments) p
    GROUP BY lower(p->>'payment_method')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Un método de pago no puede repetirse dentro de la misma transacción.';
  END IF;

  SELECT COALESCE(sum(round((p->>'amount')::numeric, 2)), 0)
  INTO v_amount
  FROM jsonb_array_elements(p_payments) p;
  RETURN v_amount;
END;
$$;

REVOKE ALL ON FUNCTION validated_transaction_payment_total(text, jsonb, boolean, boolean) FROM PUBLIC, anon, authenticated;

-- Replaces the existing funnel create path without changing its signature.
-- Non-transfer units remain backward-compatible; transfer units now carry one
-- typed outgoing leg and one typed incoming leg in the same transaction.
CREATE OR REPLACE FUNCTION create_funnel_unit(
  p_client_uuid uuid,
  p_date date,
  p_transaction_type text,
  p_currency text,
  p_subcategory_id uuid DEFAULT NULL,
  p_subcategory_name text DEFAULT NULL,
  p_catalog_item_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_transfer_direction text DEFAULT NULL,
  p_payments jsonb DEFAULT '[]',
  p_professionals jsonb DEFAULT '[]',
  p_product_id uuid DEFAULT NULL,
  p_product_qty numeric DEFAULT 0,
  p_unit_sale_price numeric DEFAULT 0,
  p_sena_amount numeric DEFAULT NULL,
  p_created_by uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id uuid;
  v_amount numeric;
  v_direction text;
  v_stock numeric;
  v_inventory_pending boolean := false;
  v_run_fifo boolean := false;
  v_deducts_inventory boolean := false;
  v_category_transaction_type text;
  v_category_name_normalized text;
  v_is_internal_transfer boolean := false;
  v_recipe record;
  v_prod record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_client_uuid IS NULL THEN RAISE EXCEPTION 'client_uuid es obligatorio.'; END IF;
  IF p_date IS NULL OR p_currency NOT IN ('ARS', 'USD', 'EUR') THEN
    RAISE EXCEPTION 'La fecha o moneda de la transacción no es válida.';
  END IF;
  IF jsonb_typeof(p_professionals) <> 'array' THEN
    RAISE EXCEPTION 'El formato de profesionales no es válido.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_client_uuid::text, 4));
  SELECT id INTO v_tx_id FROM transactions WHERE client_uuid = p_client_uuid;
  IF FOUND THEN RETURN jsonb_build_object('transaction_id', v_tx_id); END IF;

  IF p_subcategory_id IS NOT NULL THEN
    SELECT transaction_type,
           lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))
    INTO v_category_transaction_type, v_category_name_normalized
    FROM transaction_categories
    WHERE id = p_subcategory_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'La subcategoría indicada no existe.'; END IF;
    IF v_category_transaction_type IS DISTINCT FROM p_transaction_type THEN
      RAISE EXCEPTION 'El tipo de transacción no coincide con la subcategoría seleccionada.';
    END IF;
  END IF;

  v_is_internal_transfer := p_transaction_type = 'transfer'
    AND v_category_name_normalized = 'transferencia interna';

  v_amount := validated_transaction_payment_total(
    p_transaction_type,
    p_payments,
    false,
    v_is_internal_transfer
  );
  v_direction := CASE
    WHEN p_transaction_type = 'income' THEN 'entrada'
    WHEN p_transaction_type = 'expense' THEN 'salida'
    WHEN p_transaction_type = 'transfer' AND NOT v_is_internal_transfer THEN NULLIF(p_transfer_direction, '')
    ELSE NULL
  END;

  IF p_transaction_type = 'transfer'
     AND NOT v_is_internal_transfer
     AND (v_direction IS NULL OR v_direction NOT IN ('entrada', 'salida')) THEN
    RAISE EXCEPTION 'La dirección de la transferencia debe ser entrada o salida.';
  END IF;

  IF p_product_id IS NOT NULL THEN
    SELECT stock INTO v_stock FROM products_with_stock WHERE id = p_product_id;
    IF FOUND AND v_stock >= p_product_qty THEN
      v_run_fifo := true;
    ELSE
      v_inventory_pending := true;
    END IF;
  END IF;

  IF v_run_fifo AND jsonb_array_length(p_payments) = 0 THEN
    SELECT COALESCE(deducts_inventory, false)
    INTO v_deducts_inventory
    FROM transaction_categories
    WHERE id = p_subcategory_id;

    IF v_deducts_inventory THEN
      SELECT COALESCE(sum(
        LEAST(remaining_quantity,
              GREATEST(p_product_qty - (running_total - remaining_quantity), 0)
        ) * unit_cost
      ), 0)
      INTO v_amount
      FROM (
        SELECT unit_cost, remaining_quantity,
               sum(remaining_quantity) OVER (ORDER BY received_date ROWS UNBOUNDED PRECEDING) AS running_total
        FROM inventory_lots
        WHERE product_id = p_product_id AND remaining_quantity > 0
      ) lots
      WHERE running_total - remaining_quantity < p_product_qty;
    END IF;
  END IF;

  INSERT INTO transactions (
    date, amount, currency, subcategory_id, catalog_item_id, description,
    is_seña, seña_amount, refunds_anticipo_id,
    product_id, inventory_pending, created_by, client_uuid
  ) VALUES (
    p_date, v_amount, p_currency, p_subcategory_id, p_catalog_item_id, p_description,
    false, p_sena_amount, null,
    p_product_id, v_inventory_pending, p_created_by, p_client_uuid
  ) RETURNING id INTO v_tx_id;

  IF jsonb_array_length(p_payments) > 0 THEN
    INSERT INTO transaction_payments (transaction_id, payment_method, instrument, amount, type)
    SELECT v_tx_id,
           p->>'payment_method',
           NULLIF(p->>'instrument', ''),
           round((p->>'amount')::numeric, 2),
           CASE WHEN v_is_internal_transfer THEN p->>'type' ELSE v_direction END
    FROM jsonb_array_elements(p_payments) p;
  END IF;

  IF jsonb_array_length(p_professionals) > 0 THEN
    INSERT INTO transaction_hairdressers (transaction_id, hairdresser_id, commission_rate)
    SELECT v_tx_id, (p->>'hairdresser_id')::uuid, (p->>'commission_rate')::numeric
    FROM jsonb_array_elements(p_professionals) p;
  END IF;

  IF p_catalog_item_id IS NOT NULL THEN
    FOR v_recipe IN
      SELECT product_id, quantity_grams FROM service_recipes WHERE catalog_item_id = p_catalog_item_id
    LOOP
      SELECT id, min_cost, max_cost, unit_size
      INTO v_prod
      FROM products_with_stock
      WHERE id = v_recipe.product_id;

      IF FOUND AND v_prod.unit_size IS NOT NULL THEN
        INSERT INTO transaction_recipe_costs (
          transaction_id, catalog_item_id, product_id, quantity_grams, avg_unit_cost, unit_size
        ) VALUES (
          v_tx_id, p_catalog_item_id, v_recipe.product_id, v_recipe.quantity_grams,
          (COALESCE(v_prod.min_cost, 0) + COALESCE(v_prod.max_cost, COALESCE(v_prod.min_cost, 0))) / 2,
          v_prod.unit_size
        );
      END IF;
    END LOOP;
  END IF;

  IF v_run_fifo THEN
    PERFORM consume_inventory_fifo(p_product_id, p_product_qty, v_tx_id, p_unit_sale_price, p_created_by);
  END IF;

  IF p_subcategory_name = 'Préstamos otorgados' THEN
    INSERT INTO receivables (
      debtor_name, concept, total_amount, source_transaction_id, created_by, currency
    ) VALUES (
      COALESCE(p_description, 'Sin nombre'), 'Préstamo', v_amount, v_tx_id, p_created_by, p_currency
    );
  END IF;

  RETURN jsonb_build_object('transaction_id', v_tx_id);
END;
$$;

REVOKE ALL ON FUNCTION create_funnel_unit(uuid, date, text, text, uuid, text, uuid, text, text, jsonb, jsonb, uuid, numeric, numeric, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_funnel_unit(uuid, date, text, text, uuid, text, uuid, text, text, jsonb, jsonb, uuid, numeric, numeric, numeric, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION update_transaction_atomic(
  p_transaction_id uuid,
  p_transaction jsonb,
  p_payments jsonb,
  p_professionals jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old transactions%ROWTYPE;
  v_date date;
  v_currency text;
  v_subcategory_id uuid;
  v_catalog_item_id uuid;
  v_description text;
  v_is_sena boolean;
  v_sena_amount numeric(12,2);
  v_refunds_anticipo_id uuid;
  v_product_id uuid;
  v_transaction_type text;
  v_category_transaction_type text;
  v_category_name_normalized text;
  v_is_internal_transfer boolean := false;
  v_direction text;
  v_amount numeric(12,2);
  v_deducts_inventory boolean := false;
  v_has_sale_items boolean;
  v_sale_product_id uuid;
  v_stock numeric;
  v_inventory_pending boolean := false;
  v_run_fifo boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Solo un administrador puede editar transacciones.';
  END IF;

  SELECT * INTO v_old
  FROM transactions
  WHERE id = p_transaction_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La transacción indicada no existe.'; END IF;
  IF v_old.voided_at IS NOT NULL THEN RAISE EXCEPTION 'No se puede editar una transacción anulada.'; END IF;
  PERFORM assert_transaction_is_unmanaged(p_transaction_id);

  IF jsonb_typeof(p_transaction) <> 'object'
     OR jsonb_typeof(p_payments) <> 'array'
     OR jsonb_typeof(p_professionals) <> 'array' THEN
    RAISE EXCEPTION 'El formato de edición de la transacción es inválido.';
  END IF;

  v_date := NULLIF(p_transaction->>'date', '')::date;
  v_currency := p_transaction->>'currency';
  v_subcategory_id := NULLIF(p_transaction->>'subcategory_id', '')::uuid;
  v_catalog_item_id := NULLIF(p_transaction->>'catalog_item_id', '')::uuid;
  v_description := NULLIF(p_transaction->>'description', '');
  v_is_sena := COALESCE((p_transaction->>'is_seña')::boolean, false);
  v_sena_amount := NULLIF(p_transaction->>'seña_amount', '')::numeric;
  v_refunds_anticipo_id := NULLIF(p_transaction->>'refunds_anticipo_id', '')::uuid;
  v_product_id := NULLIF(p_transaction->>'product_id', '')::uuid;
  v_transaction_type := p_transaction->>'transaction_type';

  IF v_date IS NULL OR v_currency NOT IN ('ARS', 'USD', 'EUR')
     OR v_transaction_type NOT IN ('income', 'expense', 'transfer') THEN
    RAISE EXCEPTION 'La fecha, moneda o tipo de transacción no es válido.';
  END IF;
  IF v_subcategory_id IS NOT NULL THEN
    SELECT COALESCE(deducts_inventory, false) OR lower(name) = 'producto',
           transaction_type,
           lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))
    INTO v_deducts_inventory, v_category_transaction_type, v_category_name_normalized
    FROM transaction_categories
    WHERE id = v_subcategory_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'La subcategoría indicada no existe.'; END IF;
    IF v_category_transaction_type IS DISTINCT FROM v_transaction_type THEN
      RAISE EXCEPTION 'El tipo de transacción no coincide con la subcategoría seleccionada.';
    END IF;
  END IF;

  v_is_internal_transfer := v_transaction_type = 'transfer'
    AND v_category_name_normalized = 'transferencia interna';

  v_amount := validated_transaction_payment_total(
    v_transaction_type,
    p_payments,
    true,
    v_is_internal_transfer
  );

  v_direction := CASE
    WHEN v_is_sena AND lower(trim(COALESCE(v_description, ''))) = 'anticipo' THEN 'entrada'
    WHEN v_is_sena THEN 'salida'
    WHEN v_transaction_type = 'income' THEN 'entrada'
    WHEN v_transaction_type = 'expense' THEN 'salida'
    WHEN v_transaction_type = 'transfer' AND NOT v_is_internal_transfer
      THEN NULLIF(p_transaction->>'transfer_direction', '')
    ELSE NULL
  END;

  IF v_transaction_type = 'transfer'
     AND NOT v_is_internal_transfer
     AND (v_direction IS NULL OR v_direction NOT IN ('entrada', 'salida')) THEN
    RAISE EXCEPTION 'La dirección de la transferencia debe ser entrada o salida.';
  END IF;

  SELECT EXISTS (SELECT 1 FROM sale_items WHERE transaction_id = p_transaction_id),
         (SELECT product_id FROM sale_items WHERE transaction_id = p_transaction_id ORDER BY id LIMIT 1)
  INTO v_has_sale_items, v_sale_product_id;

  IF v_has_sale_items AND (NOT v_deducts_inventory OR v_product_id IS DISTINCT FROM v_sale_product_id) THEN
    RAISE EXCEPTION 'Esta transacción ya consumió inventario. No se puede cambiar su producto ni convertirla en una categoría sin inventario.';
  END IF;

  IF v_deducts_inventory THEN
    IF v_product_id IS NULL THEN RAISE EXCEPTION 'La categoría seleccionada requiere un producto.'; END IF;
    IF v_has_sale_items THEN
      v_inventory_pending := false;
    ELSE
      SELECT stock INTO v_stock FROM products_with_stock WHERE id = v_product_id;
      IF COALESCE(v_stock, 0) >= 1 THEN
        v_run_fifo := true;
        v_inventory_pending := false;
      ELSE
        v_inventory_pending := true;
      END IF;
    END IF;
  END IF;

  IF v_currency IS DISTINCT FROM v_old.currency AND EXISTS (
    SELECT 1
    FROM transaction_group_members gm
    JOIN transaction_groups g ON g.id = gm.group_id
    WHERE gm.transaction_id = p_transaction_id AND g.currency <> v_currency
  ) THEN
    RAISE EXCEPTION 'La transacción está agrupada. Desagrupala antes de cambiar su moneda.';
  END IF;

  UPDATE transactions
  SET date = v_date,
      amount = v_amount,
      currency = v_currency,
      subcategory_id = v_subcategory_id,
      catalog_item_id = v_catalog_item_id,
      description = v_description,
      is_seña = v_is_sena,
      seña_amount = v_sena_amount,
      refunds_anticipo_id = v_refunds_anticipo_id,
      product_id = v_product_id,
      inventory_pending = v_inventory_pending
  WHERE id = p_transaction_id;

  DELETE FROM transaction_payments WHERE transaction_id = p_transaction_id;
  INSERT INTO transaction_payments (transaction_id, payment_method, instrument, amount, type)
  SELECT p_transaction_id, p->>'payment_method', NULLIF(p->>'instrument', ''),
         round((p->>'amount')::numeric, 2),
         CASE WHEN v_is_internal_transfer THEN p->>'type' ELSE v_direction END
  FROM jsonb_array_elements(p_payments) p;

  DELETE FROM transaction_hairdressers WHERE transaction_id = p_transaction_id;
  INSERT INTO transaction_hairdressers (transaction_id, hairdresser_id, commission_rate)
  SELECT p_transaction_id, (p->>'hairdresser_id')::uuid,
         COALESCE((p->>'commission_rate')::numeric, 0)
  FROM jsonb_array_elements(p_professionals) p;

  DELETE FROM transaction_recipe_costs WHERE transaction_id = p_transaction_id;
  IF v_catalog_item_id IS NOT NULL THEN
    INSERT INTO transaction_recipe_costs (
      transaction_id, catalog_item_id, product_id, quantity_grams, avg_unit_cost, unit_size
    )
    SELECT p_transaction_id, v_catalog_item_id, sr.product_id, sr.quantity_grams,
           (COALESCE(p.min_cost, 0) + COALESCE(p.max_cost, COALESCE(p.min_cost, 0))) / 2,
           p.unit_size
    FROM service_recipes sr
    JOIN products_with_stock p ON p.id = sr.product_id
    WHERE sr.catalog_item_id = v_catalog_item_id
      AND p.unit_size IS NOT NULL;
  END IF;

  IF v_run_fifo THEN
    PERFORM consume_inventory_fifo(v_product_id, 1, p_transaction_id, v_amount, auth.uid());
  END IF;

  RETURN jsonb_build_object(
    'transaction_id', p_transaction_id,
    'amount', v_amount,
    'inventory_pending', v_inventory_pending
  );
END;
$$;

REVOKE ALL ON FUNCTION update_transaction_atomic(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_transaction_atomic(uuid, jsonb, jsonb, jsonb) TO authenticated;

-- Historical migration boundary: existing one-leg movements and independently
-- recorded transfer pairs are intentionally left unchanged because dates,
-- descriptions, and amounts do not prove that two rows belong to one transfer.
-- Use this read-only diagnostic for manual review; it performs no backfill:
--
-- SELECT t.id, t.date, t.amount, t.currency, t.description,
--        count(tp.id) AS leg_count,
--        array_agg(tp.payment_method || ':' || tp.type ORDER BY tp.type) AS legs
-- FROM transactions t
-- JOIN transaction_categories tc ON tc.id = t.subcategory_id
-- LEFT JOIN transaction_payments tp ON tp.transaction_id = t.id
-- WHERE tc.transaction_type = 'transfer'
-- GROUP BY t.id, t.date, t.amount, t.currency, t.description
-- HAVING count(tp.id) <> 2
--     OR count(*) FILTER (WHERE tp.type = 'entrada') <> 1
--     OR count(*) FILTER (WHERE tp.type = 'salida') <> 1;

CREATE OR REPLACE FUNCTION create_imported_transaction(
  p_client_uuid uuid,
  p_date date,
  p_amount numeric,
  p_currency text,
  p_subcategory_id uuid,
  p_description text,
  p_is_sena boolean,
  p_sena_amount numeric,
  p_payment_method text,
  p_instrument text,
  p_direction text,
  p_hairdresser_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_id uuid;
  v_amount numeric(12,2);
  v_transaction_type text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'Solo un administrador puede importar transacciones.'; END IF;
  IF p_client_uuid IS NULL THEN RAISE EXCEPTION 'client_uuid es obligatorio.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_client_uuid::text, 5));
  SELECT id INTO v_transaction_id FROM transactions WHERE client_uuid = p_client_uuid;
  IF FOUND THEN RETURN v_transaction_id; END IF;

  v_amount := round(p_amount, 2);
  IF p_date IS NULL OR v_amount <= 0 OR p_currency NOT IN ('ARS', 'USD', 'EUR')
     OR p_direction NOT IN ('entrada', 'salida') THEN
    RAISE EXCEPTION 'La fecha, importe, moneda o dirección de la transacción importada no es válida.';
  END IF;
  IF p_subcategory_id IS NOT NULL THEN
    SELECT transaction_type INTO v_transaction_type
    FROM transaction_categories
    WHERE id = p_subcategory_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'La subcategoría indicada no existe.'; END IF;
    IF v_transaction_type = 'transfer' THEN
      RAISE EXCEPTION 'Las transferencias internas requieren cuentas de origen y destino y no se importan desde este formato.';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE active AND name = p_payment_method) THEN
    RAISE EXCEPTION 'El método de pago no existe o está inactivo.';
  END IF;

  INSERT INTO transactions (
    date, amount, currency, subcategory_id, description, is_seña,
    seña_amount, created_by, client_uuid
  ) VALUES (
    p_date, v_amount, p_currency, p_subcategory_id, p_description,
    COALESCE(p_is_sena, false), round(COALESCE(p_sena_amount, 0), 2),
    auth.uid(), p_client_uuid
  ) RETURNING id INTO v_transaction_id;

  INSERT INTO transaction_payments (
    transaction_id, payment_method, instrument, amount, type
  ) VALUES (
    v_transaction_id, p_payment_method, NULLIF(p_instrument, ''), v_amount, p_direction
  );

  IF p_hairdresser_id IS NOT NULL THEN
    INSERT INTO transaction_hairdressers (transaction_id, hairdresser_id)
    VALUES (v_transaction_id, p_hairdresser_id);
  END IF;

  RETURN v_transaction_id;
END;
$$;

REVOKE ALL ON FUNCTION create_imported_transaction(uuid, date, numeric, text, uuid, text, boolean, numeric, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_imported_transaction(uuid, date, numeric, text, uuid, text, boolean, numeric, text, text, text, uuid) TO authenticated;

-- 4. Atomic reserve writes and synchronized reserve edits. ------------------

CREATE OR REPLACE FUNCTION create_reserve_movement_atomic(
  p_reserve_id uuid,
  p_amount numeric,
  p_date date,
  p_payment_method text,
  p_note text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement_id uuid;
  v_transaction_id uuid;
  v_reserve_name text;
  v_subcategory_id uuid;
  v_amount numeric(12,2);
  v_description text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'Solo un administrador puede registrar movimientos de reserva.'; END IF;

  v_amount := round(p_amount, 2);
  IF v_amount IS NULL OR v_amount = 0 OR p_date IS NULL THEN
    RAISE EXCEPTION 'El importe y la fecha son obligatorios.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE active AND name = p_payment_method) THEN
    RAISE EXCEPTION 'El método de pago no existe o está inactivo.';
  END IF;

  SELECT name INTO v_reserve_name FROM reserve_accounts WHERE id = p_reserve_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La cuenta de reserva indicada no existe.'; END IF;
  SELECT id INTO v_subcategory_id
  FROM transaction_categories
  WHERE name = 'Transferencia interna';
  IF v_subcategory_id IS NULL THEN
    RAISE EXCEPTION 'Falta la subcategoría "Transferencia interna".';
  END IF;

  v_description := CASE WHEN v_amount > 0
    THEN 'Transferencia → ' || v_reserve_name
    ELSE 'Retorno ← ' || v_reserve_name
  END;

  INSERT INTO reserve_movements (reserve_id, amount, date, payment_method, note)
  VALUES (p_reserve_id, v_amount, p_date, p_payment_method, p_note)
  RETURNING id INTO v_movement_id;

  INSERT INTO transactions (
    date, amount, currency, description, subcategory_id, catalog_item_id,
    is_seña, seña_amount, created_by
  ) VALUES (
    p_date, abs(v_amount), 'ARS', v_description, v_subcategory_id, null,
    false, null, auth.uid()
  ) RETURNING id INTO v_transaction_id;

  INSERT INTO transaction_payments (transaction_id, payment_method, instrument, amount, type)
  VALUES (
    v_transaction_id, p_payment_method, null, abs(v_amount),
    CASE WHEN v_amount > 0 THEN 'salida' ELSE 'entrada' END
  );

  UPDATE reserve_movements SET transaction_id = v_transaction_id WHERE id = v_movement_id;
  RETURN jsonb_build_object('movement_id', v_movement_id, 'transaction_id', v_transaction_id);
END;
$$;

REVOKE ALL ON FUNCTION create_reserve_movement_atomic(uuid, numeric, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_reserve_movement_atomic(uuid, numeric, date, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION update_reserve_movement(
  p_id uuid, p_amount numeric, p_date date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_amount numeric(12,2);
  v_transaction_id uuid;
  v_payment_method text;
  v_new_amount numeric(12,2);
  v_mirror_updated boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'Solo un administrador puede editar movimientos de reserva.'; END IF;
  IF p_amount IS NULL OR round(p_amount, 2) <= 0 OR p_date IS NULL THEN
    RAISE EXCEPTION 'El importe y la fecha son obligatorios.';
  END IF;

  SELECT amount, transaction_id, payment_method
  INTO v_old_amount, v_transaction_id, v_payment_method
  FROM reserve_movements WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El movimiento de reserva no existe.'; END IF;

  v_new_amount := CASE WHEN v_old_amount < 0 THEN -round(p_amount, 2) ELSE round(p_amount, 2) END;
  UPDATE reserve_movements SET amount = v_new_amount, date = p_date WHERE id = p_id;

  IF v_transaction_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM transactions WHERE id = v_transaction_id AND voided_at IS NOT NULL) THEN
      RAISE EXCEPTION 'La transacción espejo está anulada. No se puede editar este movimiento.';
    END IF;

    PERFORM set_config('erp.allow_managed_mirror_update', 'true', true);
    UPDATE transactions
    SET amount = abs(v_new_amount), date = p_date
    WHERE id = v_transaction_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'La transacción espejo del movimiento no existe.'; END IF;

    UPDATE transaction_payments
    SET amount = abs(v_new_amount),
        payment_method = v_payment_method,
        type = CASE WHEN v_new_amount > 0 THEN 'salida' ELSE 'entrada' END
    WHERE transaction_id = v_transaction_id;
    IF NOT FOUND THEN
      INSERT INTO transaction_payments (transaction_id, payment_method, instrument, amount, type)
      VALUES (
        v_transaction_id, v_payment_method, null, abs(v_new_amount),
        CASE WHEN v_new_amount > 0 THEN 'salida' ELSE 'entrada' END
      );
    END IF;
    v_mirror_updated := true;
  END IF;

  RETURN jsonb_build_object('mirror_updated', v_mirror_updated);
END;
$$;

REVOKE ALL ON FUNCTION update_reserve_movement(uuid, numeric, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_reserve_movement(uuid, numeric, date) TO authenticated;

-- 5. Receive inventory and record its accounting treatment atomically. ------

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS settlement_mode text;

ALTER TABLE purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_settlement_mode_check;
ALTER TABLE purchase_orders
  ADD CONSTRAINT purchase_orders_settlement_mode_check
  CHECK (settlement_mode IN ('immediate', 'deferred', 'none'));

UPDATE purchase_orders
SET settlement_mode = 'immediate'
WHERE settlement_mode IS NULL AND payment_transaction_id IS NOT NULL;

UPDATE purchase_orders po
SET settlement_mode = 'deferred'
WHERE settlement_mode IS NULL
  AND EXISTS (SELECT 1 FROM supplier_debts d WHERE d.purchase_order_id = po.id);

-- Keep the previous browser flow safe during rollout. The new client writes
-- everything through receive_purchase_order_accounted, but these triggers make
-- the accounting mode explicit if an already-open old client finishes a
-- receipt using the former multi-request flow.
CREATE OR REPLACE FUNCTION infer_purchase_order_immediate_settlement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_transaction_id IS NOT NULL AND NEW.settlement_mode IS NULL THEN
    NEW.settlement_mode := 'immediate';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_infer_po_immediate_settlement ON purchase_orders;
CREATE TRIGGER trg_infer_po_immediate_settlement
BEFORE INSERT OR UPDATE OF payment_transaction_id ON purchase_orders
FOR EACH ROW
EXECUTE FUNCTION infer_purchase_order_immediate_settlement();

CREATE OR REPLACE FUNCTION infer_purchase_order_deferred_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE purchase_orders
  SET settlement_mode = 'deferred'
  WHERE id = NEW.purchase_order_id AND settlement_mode IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_infer_po_deferred_settlement ON supplier_debts;
CREATE TRIGGER trg_infer_po_deferred_settlement
AFTER INSERT ON supplier_debts
FOR EACH ROW
EXECUTE FUNCTION infer_purchase_order_deferred_settlement();

CREATE OR REPLACE FUNCTION receive_purchase_order_accounted(
  p_po_id uuid,
  p_items jsonb,
  p_mode text,
  p_payment_method text DEFAULT NULL,
  p_payment_date date DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_subcategory_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_po purchase_orders%ROWTYPE;
  v_supplier_name text;
  v_total numeric(12,2);
  v_transaction_id uuid;
  v_debt_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'Solo un administrador puede recibir órdenes de compra.'; END IF;
  IF p_mode NOT IN ('immediate', 'deferred', 'none') THEN
    RAISE EXCEPTION 'La modalidad contable de la recepción no es válida.';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Seleccioná al menos un ítem para recibir.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) item
    WHERE COALESCE((item->>'quantity')::numeric, 0) <= 0
       OR NOT EXISTS (
         SELECT 1 FROM purchase_order_items poi
         WHERE poi.id = (item->>'id')::uuid
           AND poi.purchase_order_id = p_po_id
           AND (item->>'quantity')::numeric <= poi.quantity
       )
  ) THEN
    RAISE EXCEPTION 'La lista de ítems recibidos es inválida.';
  END IF;

  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La orden de compra indicada no existe.'; END IF;

  IF v_po.settlement_mode IS NOT NULL THEN
    SELECT id INTO v_debt_id FROM supplier_debts WHERE purchase_order_id = p_po_id LIMIT 1;
    RETURN jsonb_build_object(
      'purchase_order_id', p_po_id,
      'settlement_mode', v_po.settlement_mode,
      'transaction_id', v_po.payment_transaction_id,
      'debt_id', v_debt_id,
      'replayed', true
    );
  END IF;
  IF v_po.status <> 'draft' THEN
    RAISE EXCEPTION 'La orden ya fue recibida sin una modalidad contable verificable. Requiere conciliación manual.';
  END IF;

  SELECT round(
    COALESCE(sum((item->>'quantity')::numeric * poi.unit_cost), 0)
      + v_po.shipping_cost - v_po.discount_amount,
    2
  )
  INTO v_total
  FROM jsonb_array_elements(p_items) item
  JOIN purchase_order_items poi ON poi.id = (item->>'id')::uuid
  WHERE poi.purchase_order_id = p_po_id;

  IF p_mode <> 'none' AND v_total <= 0 THEN
    RAISE EXCEPTION 'El total contabilizado de la recepción debe ser mayor que cero.';
  END IF;

  IF p_mode = 'immediate' THEN
    IF p_payment_date IS NULL OR NOT EXISTS (
      SELECT 1 FROM payment_methods WHERE active AND name = p_payment_method
    ) THEN RAISE EXCEPTION 'El pago inmediato requiere fecha y un método activo.'; END IF;
    IF p_subcategory_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM transaction_categories
      WHERE id = p_subcategory_id AND transaction_type = 'expense'
    ) THEN RAISE EXCEPTION 'Falta la categoría de compra de inventario.'; END IF;
  END IF;

  PERFORM receive_purchase_order(p_po_id, auth.uid(), p_items);
  SELECT name INTO v_supplier_name FROM suppliers WHERE id = v_po.supplier_id;

  IF p_mode = 'immediate' THEN
    INSERT INTO transactions (
      date, amount, currency, subcategory_id, description,
      is_seña, seña_amount, created_by
    ) VALUES (
      p_payment_date, v_total, 'ARS', p_subcategory_id,
      'Pago OC' || COALESCE(' - ' || v_supplier_name, ''),
      false, null, auth.uid()
    ) RETURNING id INTO v_transaction_id;

    INSERT INTO transaction_payments (transaction_id, payment_method, instrument, amount, type)
    VALUES (v_transaction_id, p_payment_method, null, v_total, 'salida');
  ELSIF p_mode = 'deferred' THEN
    INSERT INTO supplier_debts (
      purchase_order_id, supplier_id, total_amount, paid_amount, due_date, notes
    ) VALUES (
      p_po_id, v_po.supplier_id, v_total, 0, p_due_date, p_notes
    ) RETURNING id INTO v_debt_id;
  END IF;

  UPDATE purchase_orders
  SET payment_transaction_id = v_transaction_id,
      settlement_mode = p_mode
  WHERE id = p_po_id;

  RETURN jsonb_build_object(
    'purchase_order_id', p_po_id,
    'settlement_mode', p_mode,
    'total_amount', v_total,
    'transaction_id', v_transaction_id,
    'debt_id', v_debt_id,
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION receive_purchase_order_accounted(uuid, jsonb, text, text, date, date, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION receive_purchase_order_accounted(uuid, jsonb, text, text, date, date, text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION infer_purchase_order_immediate_settlement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION infer_purchase_order_deferred_settlement() FROM PUBLIC, anon, authenticated;

-- 6. Voiding reverses reserves and collections, and blocks other owners. -----

CREATE OR REPLACE FUNCTION assert_transaction_is_voidable(p_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM assert_transaction_is_not_commission_payout(p_transaction_id);

  IF EXISTS (SELECT 1 FROM supplier_debt_payments WHERE transaction_id = p_transaction_id) THEN
    RAISE EXCEPTION 'Anulá el pago desde Cuentas por pagar para recalcular la deuda.';
  END IF;
  IF EXISTS (SELECT 1 FROM purchase_orders WHERE payment_transaction_id = p_transaction_id) THEN
    RAISE EXCEPTION 'El pago pertenece a una orden de compra recibida y no puede anularse aisladamente.';
  END IF;
  IF EXISTS (SELECT 1 FROM receivables WHERE source_transaction_id = p_transaction_id) THEN
    RAISE EXCEPTION 'La transacción originó una cuenta por cobrar y no puede anularse aisladamente.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION reverse_transaction_reserve_movements(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_total numeric := 0;
BEGIN
  WITH deleted AS (
    DELETE FROM reserve_movements
    WHERE transaction_id = p_transaction_id
    RETURNING amount
  )
  SELECT count(*)::integer, COALESCE(sum(amount), 0)
  INTO v_count, v_total
  FROM deleted;

  RETURN jsonb_build_object('movement_count', v_count, 'reserve_delta_removed', v_total);
END;
$$;

CREATE OR REPLACE FUNCTION reverse_receivables_before_transaction_void()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL THEN
    PERFORM assert_transaction_is_voidable(OLD.id);
    PERFORM reverse_transaction_receivable_collections(OLD.id);
    PERFORM reverse_transaction_reserve_movements(OLD.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION void_transaction(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_voided_at timestamptz;
  v_reversal jsonb;
  v_reserve_reversal jsonb;
  v_inventory jsonb := jsonb_build_object('lot_count', 0, 'lots', '[]'::jsonb);
  v_already_voided boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión para anular transacciones.'; END IF;

  SELECT voided_at INTO v_existing_voided_at
  FROM transactions WHERE id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La transacción indicada no existe.'; END IF;

  v_already_voided := v_existing_voided_at IS NOT NULL;
  PERFORM assert_transaction_is_voidable(p_transaction_id);
  v_reversal := reverse_transaction_receivable_collections(p_transaction_id);
  v_reserve_reversal := reverse_transaction_reserve_movements(p_transaction_id);

  IF NOT v_already_voided THEN
    UPDATE transactions SET voided_at = now(), voided_by = auth.uid() WHERE id = p_transaction_id;
    v_inventory := restore_transaction_inventory(p_transaction_id);
  END IF;

  IF NOT v_already_voided
     OR (v_reversal->>'collection_count')::integer > 0
     OR (v_reserve_reversal->>'movement_count')::integer > 0 THEN
    INSERT INTO user_action_logs (user_id, action, entity, entity_id, metadata)
    VALUES (
      auth.uid(), 'void_transaction', 'transactions', p_transaction_id,
      jsonb_build_object(
        'already_voided', v_already_voided,
        'receivable_reversal', v_reversal,
        'reserve_reversal', v_reserve_reversal,
        'inventory_restore', v_inventory
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'transaction_id', p_transaction_id,
    'already_voided', v_already_voided,
    'receivable_reversal', v_reversal,
    'reserve_reversal', v_reserve_reversal,
    'inventory_restore', v_inventory
  );
END;
$$;

-- Repair domain rows that are still attached to already-voided transactions.
DO $repair_voided_links$
DECLARE
  v_transaction_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM commission_payouts cp
    JOIN transactions t ON t.id = cp.paid_via_transaction_id
    WHERE t.voided_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Hay liquidaciones de comisión vinculadas a transacciones anuladas; requieren conciliación manual.';
  END IF;

  FOR v_transaction_id IN
    SELECT DISTINCT rc.transaction_id
    FROM receivable_collections rc
    JOIN transactions t ON t.id = rc.transaction_id
    WHERE t.voided_at IS NOT NULL
  LOOP
    PERFORM reverse_transaction_receivable_collections(v_transaction_id);
  END LOOP;

  DELETE FROM reserve_movements rm
  USING transactions t
  WHERE t.id = rm.transaction_id AND t.voided_at IS NOT NULL;
END
$repair_voided_links$;

REVOKE ALL ON FUNCTION transaction_managed_source(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION assert_transaction_is_unmanaged(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reject_managed_transaction_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reject_managed_payment_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION assert_transaction_is_voidable(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reverse_transaction_reserve_movements(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reverse_receivables_before_transaction_void() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION void_transaction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION void_transaction(uuid) TO authenticated;

-- 7. Opening balances are authenticated, and stale snapshots are rebuilt. ---

CREATE OR REPLACE FUNCTION get_opening_balance(
  p_before_date date,
  p_payment_method text DEFAULT NULL,
  p_currency text DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snap_year int;
  v_snap_month int;
  v_snap_balance numeric;
  v_snap_end_date date;
  v_delta numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para consultar saldos.';
  END IF;

  SELECT year, month INTO v_snap_year, v_snap_month
  FROM period_balance_snapshots
  WHERE (year * 12 + month) < (EXTRACT(YEAR FROM p_before_date)::int * 12 + EXTRACT(MONTH FROM p_before_date)::int)
    AND (p_payment_method IS NULL OR payment_method = p_payment_method)
    AND (p_currency IS NULL OR currency = p_currency)
  ORDER BY year DESC, month DESC
  LIMIT 1;

  IF v_snap_year IS NULL THEN
    v_snap_balance := 0;
    v_snap_end_date := '1900-01-01'::date;
  ELSE
    SELECT COALESCE(sum(closing_balance), 0) INTO v_snap_balance
    FROM period_balance_snapshots
    WHERE year = v_snap_year AND month = v_snap_month
      AND (p_payment_method IS NULL OR payment_method = p_payment_method)
      AND (p_currency IS NULL OR currency = p_currency);
    v_snap_end_date := (make_date(v_snap_year, v_snap_month, 1) + interval '1 month - 1 day')::date;
  END IF;

  SELECT COALESCE(sum(CASE WHEN tp.type = 'entrada' THEN tp.amount ELSE -tp.amount END), 0)
  INTO v_delta
  FROM transaction_payments tp
  JOIN transactions t ON t.id = tp.transaction_id
  WHERE t.voided_at IS NULL
    AND t.date > v_snap_end_date
    AND t.date < p_before_date
    AND (p_payment_method IS NULL OR tp.payment_method = p_payment_method)
    AND (p_currency IS NULL OR t.currency = p_currency);

  RETURN v_snap_balance + v_delta;
END;
$$;

REVOKE ALL ON FUNCTION get_opening_balance(date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_opening_balance(date, text, text) TO authenticated;

DO $recompute_snapshots$
DECLARE
  v_period record;
BEGIN
  FOR v_period IN
    SELECT DISTINCT year, month FROM period_balance_snapshots ORDER BY year, month
  LOOP
    DELETE FROM period_balance_snapshots
    WHERE year = v_period.year AND month = v_period.month;

    INSERT INTO period_balance_snapshots (
      year, month, payment_method, currency, closing_balance
    )
    SELECT v_period.year, v_period.month, tp.payment_method, t.currency,
           sum(CASE WHEN tp.type = 'entrada' THEN tp.amount ELSE -tp.amount END)
    FROM transaction_payments tp
    JOIN transactions t ON t.id = tp.transaction_id
    WHERE t.voided_at IS NULL
      AND t.date <= (make_date(v_period.year, v_period.month, 1) + interval '1 month - 1 day')::date
    GROUP BY tp.payment_method, t.currency;
  END LOOP;
END
$recompute_snapshots$;

-- Fail closed if any deterministic invariant repaired above is still broken.
DO $verify_accounting_integrity$
BEGIN
  IF EXISTS (
    SELECT 1 FROM transaction_payments
    GROUP BY transaction_id, payment_method, type HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Persisten pagos repetidos después de la reparación.'; END IF;

  IF EXISTS (
    SELECT 1 FROM reserve_movements rm
    JOIN transactions t ON t.id = rm.transaction_id
    WHERE t.voided_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Persisten movimientos de reserva vinculados a transacciones anuladas.'; END IF;

  IF EXISTS (
    SELECT 1 FROM receivable_collections rc
    JOIN transactions t ON t.id = rc.transaction_id
    WHERE t.voided_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Persisten cobranzas vinculadas a transacciones anuladas.'; END IF;
END
$verify_accounting_integrity$;
