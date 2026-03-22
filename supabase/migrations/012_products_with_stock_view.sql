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
  COALESCE(SUM(il.remaining_quantity), 0) AS stock
FROM products p
LEFT JOIN inventory_lots il ON il.product_id = p.id
WHERE p.deleted_at IS NULL
GROUP BY p.id;
