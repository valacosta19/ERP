CREATE OR REPLACE FUNCTION create_funnel_unit(
  p_client_uuid      uuid,
  p_date             date,
  p_transaction_type text,
  p_currency         text,
  p_subcategory_id   uuid    DEFAULT NULL,
  p_subcategory_name text    DEFAULT NULL,
  p_catalog_item_id  uuid    DEFAULT NULL,
  p_description      text    DEFAULT NULL,
  p_transfer_direction text  DEFAULT NULL,
  p_payments         jsonb   DEFAULT '[]',
  p_professionals    jsonb   DEFAULT '[]',
  p_product_id       uuid    DEFAULT NULL,
  p_product_qty      numeric DEFAULT 0,
  p_unit_sale_price  numeric DEFAULT 0,
  p_sena_amount      numeric DEFAULT NULL,
  p_created_by       uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tx_id        uuid;
  v_amount       numeric;
  v_direction    text;
  v_stock        numeric;
  v_inventory_pending boolean;
  v_run_fifo     boolean;
  v_recipe       record;
  v_prod         record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 1. Idempotency guard
  SELECT id INTO v_tx_id
  FROM transactions
  WHERE client_uuid = p_client_uuid;
  IF FOUND THEN
    RETURN jsonb_build_object('transaction_id', v_tx_id);
  END IF;

  -- 2. Calculate amount from payments
  SELECT COALESCE(SUM((elem->>'amount')::numeric), 0)
  INTO v_amount
  FROM jsonb_array_elements(p_payments) AS elem;

  -- 3. Calculate payment direction
  IF p_transaction_type = 'income' THEN
    v_direction := 'entrada';
  ELSIF p_transaction_type = 'transfer' THEN
    v_direction := COALESCE(p_transfer_direction, 'entrada');
  ELSE
    v_direction := 'salida';
  END IF;

  -- 4. Calculate inventory_pending and run_fifo
  v_inventory_pending := false;
  v_run_fifo := false;
  IF p_product_id IS NOT NULL THEN
    SELECT stock INTO v_stock
    FROM products_with_stock
    WHERE id = p_product_id;
    IF FOUND AND v_stock >= p_product_qty THEN
      v_run_fifo := true;
    ELSE
      v_inventory_pending := true;
    END IF;
  END IF;

  BEGIN
    -- 5. Insert transaction
    INSERT INTO transactions (
      date, amount, currency, subcategory_id, catalog_item_id, description,
      is_seña, seña_amount, refunds_anticipo_id,
      product_id, inventory_pending, created_by, client_uuid
    ) VALUES (
      p_date, v_amount, p_currency, p_subcategory_id, p_catalog_item_id, p_description,
      false, p_sena_amount, null,
      p_product_id, v_inventory_pending, p_created_by, p_client_uuid
    )
    RETURNING id INTO v_tx_id;

    -- 6. Insert payments
    IF jsonb_array_length(p_payments) > 0 THEN
      INSERT INTO transaction_payments (transaction_id, payment_method, instrument, amount, type)
      SELECT
        v_tx_id,
        elem->>'payment_method',
        NULLIF(elem->>'instrument', ''),
        (elem->>'amount')::numeric,
        v_direction
      FROM jsonb_array_elements(p_payments) AS elem;
    END IF;

    -- 7. Insert professionals
    IF jsonb_array_length(p_professionals) > 0 THEN
      INSERT INTO transaction_hairdressers (transaction_id, hairdresser_id, commission_rate)
      SELECT
        v_tx_id,
        (elem->>'hairdresser_id')::uuid,
        (elem->>'commission_rate')::numeric
      FROM jsonb_array_elements(p_professionals) AS elem;
    END IF;

    -- 8. Snapshot service recipe costs
    IF p_catalog_item_id IS NOT NULL THEN
      FOR v_recipe IN
        SELECT product_id, quantity_grams
        FROM service_recipes
        WHERE catalog_item_id = p_catalog_item_id
      LOOP
        SELECT id, min_cost, max_cost, unit_size
        INTO v_prod
        FROM products_with_stock
        WHERE id = v_recipe.product_id;

        IF FOUND AND v_prod.unit_size IS NOT NULL THEN
          INSERT INTO transaction_recipe_costs (
            transaction_id, catalog_item_id, product_id, quantity_grams,
            avg_unit_cost, unit_size
          ) VALUES (
            v_tx_id,
            p_catalog_item_id,
            v_recipe.product_id,
            v_recipe.quantity_grams,
            (COALESCE(v_prod.min_cost, 0) + COALESCE(v_prod.max_cost, COALESCE(v_prod.min_cost, 0))) / 2,
            v_prod.unit_size
          );
        END IF;
      END LOOP;
    END IF;

    -- 9. FIFO consumption
    IF v_run_fifo THEN
      PERFORM consume_inventory_fifo(p_product_id, p_product_qty, v_tx_id, p_unit_sale_price, p_created_by);
    END IF;

    -- 10. Auto-create receivable for loans
    IF p_subcategory_name = 'Préstamos otorgados' THEN
      INSERT INTO receivables (debtor_name, concept, total_amount, source_transaction_id, created_by)
      VALUES (COALESCE(p_description, 'Sin nombre'), 'Préstamo', v_amount, v_tx_id, p_created_by);
    END IF;

  EXCEPTION WHEN unique_violation THEN
    -- Race condition: another request with the same client_uuid inserted concurrently.
    -- The row already exists; just return its id.
    SELECT id INTO v_tx_id FROM transactions WHERE client_uuid = p_client_uuid;
    RETURN jsonb_build_object('transaction_id', v_tx_id);
  END;

  RETURN jsonb_build_object('transaction_id', v_tx_id);
END;
$$;
