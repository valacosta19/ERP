CREATE TABLE reserve_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reserve_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reserve_id uuid NOT NULL REFERENCES reserve_accounts(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  note text,
  date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE reserve_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reserve_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_reserve_accounts" ON reserve_accounts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "admin_all_reserve_movements" ON reserve_movements
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));
