CREATE TABLE supplier_debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE RESTRICT,
  total_amount numeric(12,2) NOT NULL,
  paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  due_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE supplier_debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_supplier_debts" ON supplier_debts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TABLE supplier_debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debt_id uuid NOT NULL REFERENCES supplier_debts(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  payment_method text NOT NULL,
  date date NOT NULL,
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE supplier_debt_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_supplier_debt_payments" ON supplier_debt_payments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
