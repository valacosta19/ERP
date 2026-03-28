CREATE TABLE transaction_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES transaction_categories(id) ON DELETE RESTRICT,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE transaction_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_all" ON transaction_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_write" ON transaction_categories FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

INSERT INTO transaction_categories (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Ingresos'),
  ('00000000-0000-0000-0000-000000000002', 'Costos'),
  ('00000000-0000-0000-0000-000000000003', 'Gastos'),
  ('00000000-0000-0000-0000-000000000004', 'Movimientos');

INSERT INTO transaction_categories (name, parent_id)
SELECT DISTINCT c.name, '00000000-0000-0000-0000-000000000001'::uuid
FROM categories c
INNER JOIN transactions t ON t.category_id = c.id AND t.type = 'income';

INSERT INTO transaction_categories (name, parent_id)
SELECT DISTINCT c.name, '00000000-0000-0000-0000-000000000003'::uuid
FROM categories c
INNER JOIN transactions t ON t.category_id = c.id AND t.type = 'expense'
WHERE c.id NOT IN (
  SELECT DISTINCT t2.category_id FROM transactions t2
  WHERE t2.type = 'income' AND t2.category_id IS NOT NULL
);

INSERT INTO transaction_categories (name, parent_id)
SELECT v.name, v.parent_id::uuid FROM (VALUES
  ('Productos (retail)',     '00000000-0000-0000-0000-000000000001'),
  ('Insumos',                '00000000-0000-0000-0000-000000000002'),
  ('Productos profesionales','00000000-0000-0000-0000-000000000002'),
  ('Alquiler',               '00000000-0000-0000-0000-000000000003'),
  ('Sueldos y cargas',       '00000000-0000-0000-0000-000000000003'),
  ('Servicios públicos',     '00000000-0000-0000-0000-000000000003'),
  ('Mantenimiento',          '00000000-0000-0000-0000-000000000003'),
  ('Marketing y publicidad', '00000000-0000-0000-0000-000000000003'),
  ('Impuestos y tasas',      '00000000-0000-0000-0000-000000000003'),
  ('Equipamiento',           '00000000-0000-0000-0000-000000000003'),
  ('Otros gastos',           '00000000-0000-0000-0000-000000000003'),
  ('Transferencia interna',  '00000000-0000-0000-0000-000000000004')
) AS v(name, parent_id)
WHERE NOT EXISTS (
  SELECT 1 FROM transaction_categories tc
  WHERE tc.name = v.name AND tc.parent_id = v.parent_id::uuid
);

ALTER TABLE transactions ADD COLUMN subcategory_id uuid REFERENCES transaction_categories(id);

UPDATE transactions t
SET subcategory_id = tc.id
FROM categories c
JOIN transaction_categories tc ON lower(tc.name) = lower(c.name) AND tc.parent_id IS NOT NULL
WHERE t.category_id = c.id AND t.subcategory_id IS NULL;

ALTER TABLE transactions DROP COLUMN category_id;

ALTER TABLE catalog_items DROP COLUMN category_id;

DROP TABLE categories;
