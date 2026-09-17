-- Same-currency internal transfers use one transaction with two opposite ledger legs.
-- Keep the already-deployed 092 migration immutable in production by applying
-- these function replacements as a forward migration.

DROP FUNCTION IF EXISTS validated_transaction_payment_total(text, jsonb, boolean);

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
