-- ============================================================
-- NOTA (agosto 2026): esta migración se detectó SIN APLICAR en la base de
-- producción, junto con la 075. Se descubrió al verificar por qué fallaba el
-- cierre de un período: la app llamaba a record_receivable_collection y a
-- void_transaction, que no existían, y "Cobrar una cuenta por cobrar" y
-- "Anular una transacción" estaban rotas.
--
-- Se aplica fuera de orden, después de las migraciones 076–084. Se verificó que
-- no hay conflicto: ninguna de esas redefine los objetos de acá, y las
-- funciones de esta migración ya validan el método de pago y redondean los
-- importes, así que cumplen la FK y el CHECK que agregó la 082.
--
-- Los guardias de abajo cortan con un mensaje claro si falta un prerrequisito o
-- si hay datos que no pasarían las restricciones, en vez de fallar con un error
-- opaco a mitad de camino.
-- ============================================================

DO $guard$
DECLARE v_faltan text;
BEGIN
  SELECT string_agg(t, ', ') INTO v_faltan
  FROM unnest(ARRAY['receivables','receivable_collections','commission_payout_receivables','transactions','payment_methods']) AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
  );
  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan tablas requeridas por esta migración: %. Aplicar antes las migraciones que las crean (041, 052).', v_faltan;
  END IF;
END $guard$;

-- Preserve the denomination of receivables from creation through collection.
ALTER TABLE receivables
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS';

UPDATE receivables r
SET currency = t.currency
FROM transactions t
WHERE r.source_transaction_id = t.id
  AND r.currency IS DISTINCT FROM t.currency;

ALTER TABLE receivables
  DROP CONSTRAINT IF EXISTS receivables_currency_check;
ALTER TABLE receivables
  ADD CONSTRAINT receivables_currency_check
  CHECK (currency IN ('ARS', 'USD', 'EUR')) NOT VALID;
-- Antes de validar: si alguna fila tiene una moneda fuera de ARS/USD/EUR, la
-- validación falla con un error de constraint que no dice cuál es. Cortar acá.
DO $guard$
DECLARE v_malas text;
BEGIN
  SELECT string_agg(DISTINCT COALESCE(currency, '(nulo)'), ', ') INTO v_malas
  FROM receivables WHERE currency IS NULL OR currency NOT IN ('ARS', 'USD', 'EUR');
  IF v_malas IS NOT NULL THEN
    RAISE EXCEPTION 'Hay cuentas por cobrar con monedas inválidas: %. Corregirlas antes de seguir.', v_malas;
  END IF;
END $guard$;

ALTER TABLE receivables VALIDATE CONSTRAINT receivables_currency_check;

-- Product withdrawals are inventory-valued receivables and remain ARS.
CREATE OR REPLACE FUNCTION create_staff_receivable(
  p_client_uuid    uuid,
  p_hairdresser_id uuid,
  p_product_id     uuid,
  p_quantity       numeric,
  p_value_amount   numeric,
  p_due_date       date,
  p_notes          text,
  p_created_by     uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receivable_id uuid;
  v_debtor_name   text;
  v_product_name  text;
  v_avg_unit_cost numeric(12,4) := 0;
  v_total_cost    numeric(12,4) := 0;
  v_lot           RECORD;
  v_qty_needed    numeric := p_quantity;
  v_qty_to_take   numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Idempotency guard (before any writes — prevents duplicate FIFO consumption on retry)
  IF p_client_uuid IS NOT NULL THEN
    SELECT id INTO v_receivable_id
    FROM receivables
    WHERE client_uuid = p_client_uuid;
    IF FOUND THEN
      RETURN v_receivable_id;
    END IF;
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor que cero.';
  END IF;
  IF p_value_amount IS NULL OR p_value_amount < 0 THEN
    RAISE EXCEPTION 'El valor del retiro no puede ser negativo.';
  END IF;

  SELECT name INTO v_debtor_name FROM hairdressers WHERE id = p_hairdresser_id;
  IF v_debtor_name IS NULL THEN
    RAISE EXCEPTION 'Empleado no encontrado: %', p_hairdresser_id;
  END IF;

  SELECT name INTO v_product_name FROM products WHERE id = p_product_id;
  IF v_product_name IS NULL THEN
    RAISE EXCEPTION 'Producto no encontrado: %', p_product_id;
  END IF;

  v_receivable_id := gen_random_uuid();

  BEGIN
    INSERT INTO receivables (
      id, debtor_name, concept, total_amount, collected_amount,
      due_date, notes, created_by,
      hairdresser_id, product_id, quantity, unit_cost_snapshot, client_uuid, currency
    ) VALUES (
      v_receivable_id, v_debtor_name,
      'Retiro de producto - ' || v_product_name,
      p_value_amount, 0,
      p_due_date, p_notes, p_created_by,
      p_hairdresser_id, p_product_id, p_quantity, 0, p_client_uuid, 'ARS'
    );

    FOR v_lot IN
      SELECT id, remaining_quantity, unit_cost
      FROM inventory_lots
      WHERE product_id = p_product_id AND remaining_quantity > 0
      ORDER BY received_date ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_qty_needed <= 0;

      v_qty_to_take := LEAST(v_lot.remaining_quantity, v_qty_needed);

      UPDATE inventory_lots
      SET remaining_quantity = remaining_quantity - v_qty_to_take
      WHERE id = v_lot.id;

      INSERT INTO inventory_movements (
        lot_id, product_id, movement_type, quantity, unit_cost,
        reference_type, reference_id, created_by, reason
      ) VALUES (
        v_lot.id, p_product_id, 'out', v_qty_to_take, v_lot.unit_cost,
        'receivable', v_receivable_id, p_created_by,
        'Retiro de staff: ' || v_debtor_name
      );

      v_total_cost := v_total_cost + (v_qty_to_take * v_lot.unit_cost);
      v_qty_needed := v_qty_needed - v_qty_to_take;
    END LOOP;

    IF v_qty_needed > 0 THEN
      RAISE EXCEPTION 'Stock insuficiente para el producto %. Faltan % unidades.',
        v_product_name, v_qty_needed;
    END IF;

    v_avg_unit_cost := v_total_cost / p_quantity;

    UPDATE receivables
    SET unit_cost_snapshot = v_avg_unit_cost
    WHERE id = v_receivable_id;

  EXCEPTION WHEN unique_violation THEN
    -- Race condition: concurrent call with same client_uuid already committed.
    SELECT id INTO v_receivable_id FROM receivables WHERE client_uuid = p_client_uuid;
    RETURN v_receivable_id;
  END;

  RETURN v_receivable_id;
END;
$$;

-- Salary advances inherit the currency of their cash-out transaction.
CREATE OR REPLACE FUNCTION create_staff_advance(
  p_client_uuid    uuid,
  p_hairdresser_id uuid,
  p_amount         numeric,
  p_currency       text,
  p_payment_method text,
  p_date           date,
  p_subcategory_id uuid,
  p_notes          text,
  p_created_by     uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receivable_id uuid;
  v_tx_id         uuid;
  v_name          text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Idempotency guard
  IF p_client_uuid IS NOT NULL THEN
    SELECT id INTO v_receivable_id
    FROM receivables
    WHERE client_uuid = p_client_uuid;
    IF FOUND THEN
      RETURN v_receivable_id;
    END IF;
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto del adelanto debe ser mayor que cero.';
  END IF;
  IF p_currency IS NULL OR p_currency NOT IN ('ARS', 'USD', 'EUR') THEN
    RAISE EXCEPTION 'La moneda del adelanto no es válida.';
  END IF;

  SELECT name INTO v_name FROM hairdressers WHERE id = p_hairdresser_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Empleado no encontrado: %', p_hairdresser_id;
  END IF;

  BEGIN
    INSERT INTO transactions (
      date, amount, currency, subcategory_id, description,
      is_seña, seña_amount, catalog_item_id,
      product_id, inventory_pending, created_by, client_uuid
    ) VALUES (
      p_date, p_amount, p_currency, p_subcategory_id,
      'Adelanto de sueldo - ' || v_name,
      false, null, null,
      null, false, p_created_by, p_client_uuid
    )
    RETURNING id INTO v_tx_id;

    INSERT INTO transaction_payments (
      transaction_id, payment_method, instrument, amount, type
    ) VALUES (
      v_tx_id, p_payment_method, null, p_amount, 'salida'
    );

    INSERT INTO receivables (
      debtor_name, concept, total_amount, collected_amount,
      notes, created_by,
      hairdresser_id, source_transaction_id, client_uuid, currency
    ) VALUES (
      v_name, 'Adelanto de sueldo', p_amount, 0,
      p_notes, p_created_by,
      p_hairdresser_id, v_tx_id, p_client_uuid, p_currency
    )
    RETURNING id INTO v_receivable_id;

  EXCEPTION WHEN unique_violation THEN
    -- Race condition: concurrent call already committed.
    SELECT id INTO v_receivable_id FROM receivables WHERE client_uuid = p_client_uuid;
    RETURN v_receivable_id;
  END;

  RETURN v_receivable_id;
END;
$$;

-- Granted loans inherit the currency selected in the transaction funnel.
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
  v_tx_id             uuid;
  v_amount            numeric;
  v_direction         text;
  v_stock             numeric;
  v_inventory_pending boolean;
  v_run_fifo          boolean;
  v_deducts_inventory boolean;
  v_recipe            record;
  v_prod              record;
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

  -- 4b. When subcategory deducts inventory and no cash payment was provided,
  --     compute the real FIFO cost from the lots (same order as consume_inventory_fifo)
  --     so the transaction amount reflects inventory cost, not a cash outflow.
  IF v_run_fifo AND jsonb_array_length(p_payments) = 0 THEN
    SELECT COALESCE(deducts_inventory, false)
    INTO v_deducts_inventory
    FROM transaction_categories
    WHERE id = p_subcategory_id;

    IF v_deducts_inventory THEN
      SELECT COALESCE(SUM(
        LEAST(remaining_quantity,
              GREATEST(p_product_qty - (running_total - remaining_quantity), 0)
        ) * unit_cost
      ), 0)
      INTO v_amount
      FROM (
        SELECT unit_cost, remaining_quantity,
               SUM(remaining_quantity) OVER (ORDER BY received_date ROWS UNBOUNDED PRECEDING) AS running_total
        FROM inventory_lots
        WHERE product_id = p_product_id AND remaining_quantity > 0
      ) lots
      WHERE running_total - remaining_quantity < p_product_qty;
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
      INSERT INTO receivables (debtor_name, concept, total_amount, source_transaction_id, created_by, currency)
      VALUES (COALESCE(p_description, 'Sin nombre'), 'Préstamo', v_amount, v_tx_id, p_created_by, p_currency);
    END IF;

  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_tx_id FROM transactions WHERE client_uuid = p_client_uuid;
    RETURN jsonb_build_object('transaction_id', v_tx_id);
  END;

  RETURN jsonb_build_object('transaction_id', v_tx_id);
END;
$$;

-- Manual collections are atomic and derive their currency from the locked receivable.
ALTER TABLE receivable_collections ADD COLUMN IF NOT EXISTS client_uuid uuid;
CREATE UNIQUE INDEX IF NOT EXISTS receivable_collections_client_uuid_key
  ON receivable_collections(client_uuid) WHERE client_uuid IS NOT NULL;

CREATE OR REPLACE FUNCTION record_receivable_collection(
  p_client_uuid uuid,
  p_receivable_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_date date,
  p_notes text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_collection_id uuid;
  v_transaction_id uuid;
  v_total numeric(12,2);
  v_collected numeric(12,2);
  v_currency text;
  v_debtor_name text;
  v_concept text;
  v_amount numeric(12,2);
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Solo un administrador puede registrar cobros.';
  END IF;
  IF p_client_uuid IS NULL THEN
    RAISE EXCEPTION 'client_uuid es obligatorio.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_client_uuid::text, 4));
  SELECT id INTO v_collection_id
  FROM receivable_collections
  WHERE client_uuid = p_client_uuid;
  IF FOUND THEN
    RETURN v_collection_id;
  END IF;

  v_amount := round(p_amount, 2);
  IF v_amount IS NULL OR v_amount <= 0 OR p_date IS NULL THEN
    RAISE EXCEPTION 'El importe y la fecha de cobro son obligatorios.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM payment_methods WHERE active = true AND name = p_payment_method
  ) THEN
    RAISE EXCEPTION 'El método de pago no existe o está inactivo.';
  END IF;

  SELECT total_amount, collected_amount, currency, debtor_name, concept
  INTO v_total, v_collected, v_currency, v_debtor_name, v_concept
  FROM receivables
  WHERE id = p_receivable_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La cuenta por cobrar indicada no existe.';
  END IF;
  IF v_amount > round(v_total - v_collected, 2) THEN
    RAISE EXCEPTION 'El importe supera el saldo pendiente de la cuenta por cobrar.';
  END IF;

  INSERT INTO transactions (
    date, amount, currency, description, subcategory_id,
    catalog_item_id, is_seña, seña_amount, created_by, client_uuid
  ) VALUES (
    p_date, v_amount, v_currency, v_concept || ' - ' || v_debtor_name, null,
    null, false, null, auth.uid(), p_client_uuid
  ) RETURNING id INTO v_transaction_id;

  INSERT INTO transaction_payments (
    transaction_id, payment_method, instrument, amount, type
  ) VALUES (
    v_transaction_id, p_payment_method, null, v_amount, 'entrada'
  );

  INSERT INTO receivable_collections (
    receivable_id, amount, payment_method, date, transaction_id, notes, client_uuid
  ) VALUES (
    p_receivable_id, v_amount, p_payment_method, p_date,
    v_transaction_id, p_notes, p_client_uuid
  ) RETURNING id INTO v_collection_id;

  UPDATE receivables
  SET collected_amount = collected_amount + v_amount
  WHERE id = p_receivable_id;

  RETURN v_collection_id;
END;
$$;

REVOKE ALL ON FUNCTION record_receivable_collection(uuid, uuid, numeric, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_receivable_collection(uuid, uuid, numeric, text, date, text) TO authenticated;

-- Commissions are settled in ARS. Foreign-currency receivables cannot be offset
-- until an explicit, persisted FX policy exists.
CREATE OR REPLACE FUNCTION enforce_ars_commission_receivable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM receivables
    WHERE id = NEW.receivable_id AND currency <> 'ARS'
  ) THEN
    RAISE EXCEPTION 'Las cuentas por cobrar en moneda extranjera no pueden compensarse contra comisiones en ARS sin una cotización persistida.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS commission_payout_receivables_ars_only ON commission_payout_receivables;
CREATE TRIGGER commission_payout_receivables_ars_only
BEFORE INSERT OR UPDATE ON commission_payout_receivables
FOR EACH ROW EXECUTE FUNCTION enforce_ars_commission_receivable();
