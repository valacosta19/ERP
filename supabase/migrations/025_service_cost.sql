ALTER TABLE products ADD COLUMN unit_size numeric(10,3);

ALTER TABLE catalog_items ADD COLUMN hours numeric(4,2);

CREATE TABLE fixed_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  monthly_amount numeric(12,2) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE fixed_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read fixed_costs" ON fixed_costs FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write fixed_costs" ON fixed_costs FOR ALL TO authenticated USING (true);

CREATE TABLE service_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_item_id uuid NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity_grams numeric(10,3) NOT NULL,
  UNIQUE(catalog_item_id, product_id)
);
ALTER TABLE service_recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read service_recipes" ON service_recipes FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write service_recipes" ON service_recipes FOR ALL TO authenticated USING (true);
