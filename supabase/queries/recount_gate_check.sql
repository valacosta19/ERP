-- ============================================================
-- COMPUERTA PREVIA AL RECUENTO FÍSICO (paso 0)
--
-- Correr ESTO en el SQL editor de Supabase ANTES de aplicar un recuento
-- y antes de cambiar costos de productos.
--
-- Por qué: la pestaña Costos calcula el costo de material de cada servicio
-- desde products_with_stock.min_cost/max_cost EN VIVO, sin filtro de fecha
-- (src/pages/reports/ReportsPage.tsx, serviceDeductionsByMonth). Solo las
-- transacciones que guardaron su propia foto en transaction_recipe_costs
-- están protegidas; las que no, se recalculan con los costos de hoy.
--
-- Cómo leerlo: `sin_snapshot` es la cantidad de servicios cuyo costo de
-- material se va a reescribir al cambiar los costos.
--   - Pocos  → seguir con el recuento.
--   - Muchos → la pestaña Costos nunca fue históricamente estable; decidir
--              con ese dato si eso cambia algo antes de avanzar.
-- ============================================================

WITH servicios_con_receta AS (
  SELECT DISTINCT t.id, t.date
  FROM transactions t
  JOIN service_recipes sr ON sr.catalog_item_id = t.catalog_item_id
  WHERE t.voided_at IS NULL
    AND t.catalog_item_id IS NOT NULL
),
con_snapshot AS (
  SELECT DISTINCT transaction_id FROM transaction_recipe_costs
)
SELECT
  COUNT(*)                                                  AS total_servicios_con_receta,
  COUNT(*) FILTER (WHERE cs.transaction_id IS NULL)          AS sin_snapshot,
  COUNT(*) FILTER (WHERE cs.transaction_id IS NOT NULL)      AS con_snapshot,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE cs.transaction_id IS NULL)
    / NULLIF(COUNT(*), 0), 1
  )                                                          AS pct_sin_snapshot,
  MIN(s.date) FILTER (WHERE cs.transaction_id IS NULL)       AS primera_sin_snapshot,
  MAX(s.date) FILTER (WHERE cs.transaction_id IS NULL)       AS ultima_sin_snapshot
FROM servicios_con_receta s
LEFT JOIN con_snapshot cs ON cs.transaction_id = s.id;

-- Desglose por mes, para ver si el problema es solo de los meses viejos.
WITH servicios_con_receta AS (
  SELECT DISTINCT t.id, t.date
  FROM transactions t
  JOIN service_recipes sr ON sr.catalog_item_id = t.catalog_item_id
  WHERE t.voided_at IS NULL
    AND t.catalog_item_id IS NOT NULL
),
con_snapshot AS (
  SELECT DISTINCT transaction_id FROM transaction_recipe_costs
)
SELECT
  to_char(s.date, 'YYYY-MM')                            AS mes,
  COUNT(*)                                              AS servicios,
  COUNT(*) FILTER (WHERE cs.transaction_id IS NULL)     AS sin_snapshot
FROM servicios_con_receta s
LEFT JOIN con_snapshot cs ON cs.transaction_id = s.id
GROUP BY 1
ORDER BY 1 DESC;
