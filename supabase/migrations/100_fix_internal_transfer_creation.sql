-- Hotfix: keep the deployed frontend compatible while the broader accounting migration is split for the legacy CLI.
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
