DROP VIEW IF EXISTS products_with_stock;
CREATE VIEW products_with_stock AS
WITH last_lot AS (
  SELECT DISTINCT ON (product_id) product_id, unit_cost
  FROM inventory_lots
  ORDER BY product_id, received_date DESC, created_at DESC
)
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
  COALESCE(MIN(CASE WHEN il.remaining_quantity > 0 THEN il.unit_cost END), MAX(ll.unit_cost)) AS min_cost,
  COALESCE(MAX(CASE WHEN il.remaining_quantity > 0 THEN il.unit_cost END), MAX(ll.unit_cost)) AS max_cost
FROM products p
LEFT JOIN inventory_lots il ON il.product_id = p.id
LEFT JOIN last_lot ll ON ll.product_id = p.id
WHERE p.deleted_at IS NULL
GROUP BY p.id;

ALTER VIEW products_with_stock SET (security_invoker = true);
