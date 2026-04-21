-- DRY RUN: no modifica datos. Corré esto ANTES de aplicar 051_backfill_product_inventory_consumption.sql
-- Muestra qué haría el backfill: match único, ambiguo, sin match, ya procesado.

WITH candidates AS (
  SELECT
    t.id AS transaction_id,
    t.date,
    btrim(t.description) AS description,
    t.amount,
    c.name AS subcategory_name,
    EXISTS (
      SELECT 1 FROM inventory_movements im
      WHERE im.reference_id = t.id AND im.reference_type = 'transaction'
    ) AS already_processed
  FROM transactions t
  JOIN transaction_categories c ON c.id = t.subcategory_id
  WHERE t.voided_at IS NULL
    AND c.name IN ('Producto', 'Consumos y cortesías')
),
matched AS (
  SELECT
    c.*,
    (
      SELECT COUNT(*)
      FROM products p
      WHERE p.deleted_at IS NULL
        AND (c.description = p.name || ' ' || COALESCE(p.unit, '')
             OR c.description = p.name)
    ) AS match_count,
    (
      SELECT (array_agg(p.id))[1]
      FROM products p
      WHERE p.deleted_at IS NULL
        AND (c.description = p.name || ' ' || COALESCE(p.unit, '')
             OR c.description = p.name)
    ) AS matched_product_id
  FROM candidates c
)
SELECT
  CASE
    WHEN already_processed THEN 'already_processed'
    WHEN match_count = 0 THEN 'no_product_match'
    WHEN match_count > 1 THEN 'ambiguous_match'
    ELSE 'will_apply'
  END AS status,
  COUNT(*) AS tx_count,
  SUM(amount) AS total_amount
FROM matched
GROUP BY 1
ORDER BY 1;

-- Detalle de cada transacción que SE APLICARÁ (asumiendo stock suficiente):
SELECT
  m.transaction_id,
  m.date,
  m.subcategory_name,
  m.description,
  m.amount,
  m.matched_product_id,
  p.name AS product_name,
  p.unit AS product_unit,
  COALESCE(SUM(il.remaining_quantity), 0) AS current_stock
FROM (
  WITH candidates AS (
    SELECT
      t.id AS transaction_id,
      t.date,
      btrim(t.description) AS description,
      t.amount,
      c.name AS subcategory_name,
      EXISTS (
        SELECT 1 FROM inventory_movements im
        WHERE im.reference_id = t.id AND im.reference_type = 'transaction'
      ) AS already_processed
    FROM transactions t
    JOIN transaction_categories c ON c.id = t.subcategory_id
    WHERE t.voided_at IS NULL
      AND c.name IN ('Producto', 'Consumos y cortesías')
  )
  SELECT
    c.*,
    (SELECT COUNT(*) FROM products p
     WHERE p.deleted_at IS NULL
       AND (c.description = p.name || ' ' || COALESCE(p.unit, '')
            OR c.description = p.name)) AS match_count,
    (SELECT (array_agg(p.id))[1] FROM products p
     WHERE p.deleted_at IS NULL
       AND (c.description = p.name || ' ' || COALESCE(p.unit, '')
            OR c.description = p.name)) AS matched_product_id
  FROM candidates c
) m
LEFT JOIN products p ON p.id = m.matched_product_id
LEFT JOIN inventory_lots il ON il.product_id = m.matched_product_id
WHERE NOT m.already_processed AND m.match_count = 1
GROUP BY m.transaction_id, m.date, m.subcategory_name, m.description, m.amount, m.matched_product_id, p.name, p.unit
ORDER BY m.date;
