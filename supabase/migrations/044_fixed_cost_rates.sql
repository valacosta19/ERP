CREATE TABLE fixed_cost_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixed_cost_id uuid NOT NULL REFERENCES fixed_costs(id) ON DELETE CASCADE,
  monthly_amount numeric(12,2) NOT NULL,
  effective_from date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE fixed_cost_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read fixed_cost_rates" ON fixed_cost_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write fixed_cost_rates" ON fixed_cost_rates FOR ALL TO authenticated USING (true);

INSERT INTO fixed_cost_rates (fixed_cost_id, monthly_amount, effective_from)
SELECT id, monthly_amount, '2000-01-01'::date FROM fixed_costs;
