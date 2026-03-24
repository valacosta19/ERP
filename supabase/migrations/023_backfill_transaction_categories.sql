-- Pass 1: match catalog_items (services) — exact case-insensitive match on description
UPDATE transactions t
SET category_id = ci.category_id
FROM catalog_items ci
WHERE t.category_id IS NULL
  AND ci.category_id IS NOT NULL
  AND LOWER(t.description) = LOWER(ci.name);

-- Pass 2: match products — assign "Producto" category (find or create)
DO $$
DECLARE
  producto_cat_id UUID;
BEGIN
  SELECT id INTO producto_cat_id
  FROM categories
  WHERE LOWER(name) = 'producto'
  LIMIT 1;

  IF producto_cat_id IS NULL THEN
    INSERT INTO categories (name) VALUES ('Producto')
    RETURNING id INTO producto_cat_id;
  END IF;

  UPDATE transactions t
  SET category_id = producto_cat_id
  FROM products p
  WHERE t.category_id IS NULL
    AND p.deleted_at IS NULL
    AND LOWER(t.description) = LOWER(p.name);
END $$;
