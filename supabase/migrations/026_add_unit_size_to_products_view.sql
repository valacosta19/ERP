DROP VIEW IF EXISTS products_with_stock;
CREATE VIEW products_with_stock AS
SELECT
  p.id,
  p.name,
  p.sku,
  p.unit,
  p.sale_price,
  p.min_stock,
  p.brand,
  p.deleted_at,
  p.created_at,
  p.skip_restock,
  p.unit_size,
  COALESCE(SUM(il.remaining_quantity), 0) AS stock,
  MIN(CASE WHEN il.remaining_quantity > 0 THEN il.unit_cost END) AS min_cost,
  MAX(CASE WHEN il.remaining_quantity > 0 THEN il.unit_cost END) AS max_cost
FROM products p
LEFT JOIN inventory_lots il ON il.product_id = p.id
WHERE p.deleted_at IS NULL
GROUP BY p.id;
