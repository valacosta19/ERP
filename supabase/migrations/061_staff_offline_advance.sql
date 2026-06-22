-- ============================================================
-- Staff salary advances + idempotent offline staff RPCs
--
-- 1. Add client_uuid to receivables for idempotent offline submissions
-- 2. Seed 'Adelantos de personal' subcategory under Movimientos
-- 3. Replace create_staff_receivable with idempotent version
-- 4. New create_staff_advance RPC: atomic, idempotent cash advance
-- ============================================================

-- 1. Idempotency column on receivables
ALTER TABLE receivables ADD COLUMN IF NOT EXISTS client_uuid uuid;

CREATE UNIQUE INDEX IF NOT EXISTS receivables_client_uuid_key
  ON receivables(client_uuid)
  WHERE client_uuid IS NOT NULL;

-- 2. Seed subcategory 'Adelantos de personal' under parent 'Movimientos'
DO $$
DECLARE
  v_parent_id uuid;
BEGIN
  SELECT id INTO v_parent_id
  FROM transaction_categories
  WHERE name = 'Movimientos' AND parent_id IS NULL
  LIMIT 1;

  IF v_parent_id IS NOT NULL THEN
    INSERT INTO transaction_categories (name, parent_id, deducts_inventory)
    SELECT 'Adelantos de personal', v_parent_id, false
    WHERE NOT EXISTS (
      SELECT 1 FROM transaction_categories
      WHERE name = 'Adelantos de personal' AND parent_id = v_parent_id
    );
  END IF;
END;
$$;

-- 3. Replace create_staff_receivable with idempotent version (new p_client_uuid param)
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
      hairdresser_id, product_id, quantity, unit_cost_snapshot, client_uuid
    ) VALUES (
      v_receivable_id, v_debtor_name,
      'Retiro de producto - ' || v_product_name,
      p_value_amount, 0,
      p_due_date, p_notes, p_created_by,
      p_hairdresser_id, p_product_id, p_quantity, 0, p_client_uuid
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

GRANT EXECUTE ON FUNCTION create_staff_receivable(uuid, uuid, uuid, numeric, numeric, date, text, uuid) TO authenticated;

-- 4. New RPC: create_staff_advance (cash advance to a staff member)
--    Creates a Movimientos transaction (cash out) + a receivable against the employee.
--    Idempotent by client_uuid. No inventory side-effects.
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
      hairdresser_id, source_transaction_id, client_uuid
    ) VALUES (
      v_name, 'Adelanto de sueldo', p_amount, 0,
      p_notes, p_created_by,
      p_hairdresser_id, v_tx_id, p_client_uuid
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

GRANT EXECUTE ON FUNCTION create_staff_advance(uuid, uuid, numeric, text, text, date, uuid, text, uuid) TO authenticated;
