-- ============================================================
-- Staff product withdrawals (retiros a cuenta de comisión)
--
-- A hairdresser/employee takes a product whose cost is later
-- deducted from their commission. Modeled as a receivable
-- against the hairdresser. Inventory is consumed at the moment
-- of withdrawal but NO transaction is created (no cash/bank
-- impact). When commission is paid, the receivables are settled
-- via receivable_collections linked to the commission expense.
-- ============================================================

-- 1. Extend receivables to support staff withdrawals
ALTER TABLE receivables
  ADD COLUMN IF NOT EXISTS hairdresser_id uuid REFERENCES hairdressers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quantity numeric(12,3),
  ADD COLUMN IF NOT EXISTS unit_cost_snapshot numeric(12,4);

CREATE INDEX IF NOT EXISTS idx_receivables_hairdresser
  ON receivables(hairdresser_id)
  WHERE hairdresser_id IS NOT NULL;

-- 2. Commission payouts (audit trail of period settlements)
CREATE TABLE IF NOT EXISTS commission_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hairdresser_id uuid NOT NULL REFERENCES hairdressers(id) ON DELETE RESTRICT,
  period_start date NOT NULL,
  period_end date NOT NULL,
  gross_amount numeric(12,2) NOT NULL,
  receivables_offset numeric(12,2) NOT NULL DEFAULT 0,
  net_amount numeric(12,2) NOT NULL,
  paid_via_transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_commission_payouts_hairdresser
  ON commission_payouts(hairdresser_id, period_end DESC);

ALTER TABLE commission_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_commission_payouts" ON commission_payouts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 3. Join: which receivables were offset in which payout
CREATE TABLE IF NOT EXISTS commission_payout_receivables (
  payout_id uuid NOT NULL REFERENCES commission_payouts(id) ON DELETE CASCADE,
  receivable_id uuid NOT NULL REFERENCES receivables(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL,
  PRIMARY KEY (payout_id, receivable_id)
);

ALTER TABLE commission_payout_receivables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_commission_payout_receivables" ON commission_payout_receivables
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- 4. RPC: create a staff receivable + consume inventory FIFO
--    Bypasses sale_items (no transaction). Records inventory_movements
--    with reference_type='receivable' and reference_id=receivable.id.
CREATE OR REPLACE FUNCTION create_staff_receivable(
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

  INSERT INTO receivables (
    id, debtor_name, concept, total_amount, collected_amount,
    due_date, notes, created_by,
    hairdresser_id, product_id, quantity, unit_cost_snapshot
  ) VALUES (
    v_receivable_id, v_debtor_name,
    'Retiro de producto - ' || v_product_name,
    p_value_amount, 0,
    p_due_date, p_notes, p_created_by,
    p_hairdresser_id, p_product_id, p_quantity, 0
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

  RETURN v_receivable_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_staff_receivable(uuid, uuid, numeric, numeric, date, text, uuid) TO authenticated;

-- 5. RPC: settle a commission payout against pending staff receivables.
--    Inserts receivable_collections per receivable (full amount),
--    creates the commission_payouts row, and links via
--    commission_payout_receivables. Caller must have already
--    inserted the transaction expense for the NET amount and pass
--    its id as p_paid_via_transaction_id.
CREATE OR REPLACE FUNCTION settle_commission_payout(
  p_hairdresser_id          uuid,
  p_period_start            date,
  p_period_end              date,
  p_gross_amount            numeric,
  p_receivable_ids          uuid[],
  p_paid_via_transaction_id uuid,
  p_payment_method          text,
  p_payment_date            date,
  p_notes                   text,
  p_created_by              uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout_id        uuid;
  v_offset           numeric(12,2) := 0;
  v_net              numeric(12,2);
  v_receivable       RECORD;
  v_remaining        numeric(12,2);
BEGIN
  IF p_gross_amount IS NULL OR p_gross_amount < 0 THEN
    RAISE EXCEPTION 'gross_amount inválido';
  END IF;

  v_payout_id := gen_random_uuid();

  IF p_receivable_ids IS NOT NULL THEN
    FOR v_receivable IN
      SELECT id, total_amount, collected_amount, hairdresser_id
      FROM receivables
      WHERE id = ANY(p_receivable_ids)
      FOR UPDATE
    LOOP
      IF v_receivable.hairdresser_id IS DISTINCT FROM p_hairdresser_id THEN
        RAISE EXCEPTION 'Receivable % no pertenece al empleado indicado.', v_receivable.id;
      END IF;

      v_remaining := v_receivable.total_amount - v_receivable.collected_amount;
      IF v_remaining <= 0 THEN
        CONTINUE;
      END IF;

      INSERT INTO receivable_collections (
        receivable_id, amount, payment_method, date, transaction_id, notes
      ) VALUES (
        v_receivable.id, v_remaining, p_payment_method, p_payment_date,
        p_paid_via_transaction_id,
        'Compensado contra liquidación de comisión'
      );

      UPDATE receivables
      SET collected_amount = collected_amount + v_remaining
      WHERE id = v_receivable.id;

      INSERT INTO commission_payout_receivables (payout_id, receivable_id, amount)
      VALUES (v_payout_id, v_receivable.id, v_remaining);

      v_offset := v_offset + v_remaining;
    END LOOP;
  END IF;

  v_net := p_gross_amount - v_offset;

  INSERT INTO commission_payouts (
    id, hairdresser_id, period_start, period_end,
    gross_amount, receivables_offset, net_amount,
    paid_via_transaction_id, notes, created_by
  ) VALUES (
    v_payout_id, p_hairdresser_id, p_period_start, p_period_end,
    p_gross_amount, v_offset, v_net,
    p_paid_via_transaction_id, p_notes, p_created_by
  );

  RETURN v_payout_id;
END;
$$;

GRANT EXECUTE ON FUNCTION settle_commission_payout(uuid, date, date, numeric, uuid[], uuid, text, date, text, uuid) TO authenticated;
