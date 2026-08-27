-- ============================================================
-- Congelar el costo de material de los servicios históricos que nunca
-- guardaron su foto en transaction_recipe_costs (marzo 2026 y 4 de abril).
--
-- Por qué: la pestaña Costos calcula el costo de material en vivo desde
-- products_with_stock.min_cost/max_cost cuando no hay foto, sin filtro de
-- fecha. Al cambiar los costos en el recuento físico, esos meses se
-- reescribirían. Este backfill escribe la foto con los costos ACTUALES,
-- replicando exactamente el cálculo que hoy hace el informe, así el mes
-- queda mostrando lo mismo que muestra ahora — para siempre.
--
-- CORRER ANTES de aplicar el recuento físico (065). Después ya no sirve:
-- los costos habrían cambiado y congelaría los nuevos.
--
-- Idempotente: saltea cualquier transacción que ya tenga foto.
-- ============================================================

-- La fórmula es idéntica a create_funnel_unit paso 8 (062) y al fallback de
-- serviceDeductionsByMonth en ReportsPage.tsx:
--   avg_unit_cost = (min_cost + COALESCE(max_cost, min_cost)) / 2
-- Se excluye unit_size nulo o cero, igual que el informe (que hace
-- `if (!product?.unit_size) continue`) — un 0 haría una división por cero.
INSERT INTO transaction_recipe_costs (
  transaction_id, catalog_item_id, product_id, quantity_grams,
  avg_unit_cost, unit_size
)
SELECT
  t.id,
  t.catalog_item_id,
  sr.product_id,
  sr.quantity_grams,
  (COALESCE(pws.min_cost, 0) + COALESCE(pws.max_cost, COALESCE(pws.min_cost, 0))) / 2,
  pws.unit_size
FROM transactions t
JOIN service_recipes sr        ON sr.catalog_item_id = t.catalog_item_id
JOIN products_with_stock pws   ON pws.id = sr.product_id
WHERE t.voided_at IS NULL
  AND t.catalog_item_id IS NOT NULL
  AND pws.unit_size IS NOT NULL
  AND pws.unit_size <> 0
  AND NOT EXISTS (
    SELECT 1 FROM transaction_recipe_costs trc
    WHERE trc.transaction_id = t.id
  );

-- Log de auditoría: qué se congeló y cuándo.
DO $$
DECLARE
  v_admin uuid;
  v_rows  int;
BEGIN
  SELECT id INTO v_admin FROM profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'No hay usuario admin en profiles — no se puede registrar la auditoría.';
  END IF;

  SELECT COUNT(DISTINCT transaction_id) INTO v_rows
  FROM transaction_recipe_costs
  WHERE created_at >= now() - INTERVAL '5 minutes';

  INSERT INTO user_action_logs (user_id, action, entity, entity_id, metadata)
  VALUES (
    v_admin,
    'backfill_recipe_cost_snapshots',
    'transaction_recipe_costs',
    NULL,
    jsonb_build_object(
      'transacciones_congeladas', v_rows,
      'motivo', 'Congelar costo de material histórico antes del recuento físico'
    )
  );
END $$;

-- Verificación: sin_snapshot debe quedar en 0 o muy cerca.
-- Puede quedar un resto si TODOS los productos de la receta de ese servicio tienen
-- unit_size nulo o cero. Esos casos no hace falta congelarlos: el informe ya los
-- cuenta como 0 hoy y los va a seguir contando como 0 después del recuento, así
-- que su costo de material es estable de todas formas.
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
