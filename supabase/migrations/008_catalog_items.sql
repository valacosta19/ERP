CREATE TABLE catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can manage catalog_items"
  ON catalog_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
