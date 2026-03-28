CREATE TABLE receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debtor_name text NOT NULL,
  concept text NOT NULL,
  total_amount numeric(12,2) NOT NULL,
  collected_amount numeric(12,2) NOT NULL DEFAULT 0,
  due_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL
);

ALTER TABLE receivables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_receivables" ON receivables
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE TABLE receivable_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receivable_id uuid NOT NULL REFERENCES receivables(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  payment_method text NOT NULL,
  date date NOT NULL,
  transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE receivable_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_receivable_collections" ON receivable_collections
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
