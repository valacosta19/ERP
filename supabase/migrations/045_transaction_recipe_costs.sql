CREATE TABLE transaction_recipe_costs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id    uuid NOT NULL REFERENCES transactions(id),
  catalog_item_id   uuid NOT NULL,
  product_id        uuid NOT NULL REFERENCES products(id),
  quantity_grams    numeric NOT NULL,
  avg_unit_cost     numeric NOT NULL,
  unit_size         numeric NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON transaction_recipe_costs(transaction_id);

ALTER TABLE transaction_recipe_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read transaction_recipe_costs"
  ON transaction_recipe_costs FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "authenticated insert transaction_recipe_costs"
  ON transaction_recipe_costs FOR INSERT
  TO authenticated WITH CHECK (true);
