-- ============================================================
-- FIX de un fix: separar el pago de una OC de las compras de gasto directo.
--
-- La 068/069 vinieron acompañadas de un cambio en useProfitReport que excluía
-- la categoría 'Productos profesionales' de direct_costs, para evitar contar
-- dos veces el costo de la mercadería de inventario (una vez como gasto al
-- comprar y otra como COGS al vender).
--
-- PROBLEMA: esa categoría está sobrecargada. Se usa para el pago de OC (que
-- SÍ hay que excluir, su costo llega vía COGS) y también para compras de
-- gasto directo de productos profesionales — tinturas, oxidantes, insumos que
-- NO tienen lotes y por lo tanto NUNCA van a generar COGS. Excluir la
-- categoría entera borraba esos costos reales de la utilidad (~$845.000 solo
-- entre mayo y julio 2026).
--
-- SOLUCIÓN: categoría dedicada 'Compra de inventario (OC)' bajo Costos, usada
-- únicamente por el pago de órdenes de compra. Esa es la única que se excluye.
-- 'Productos profesionales' vuelve a contar como costo real.
-- ============================================================

-- 1. Crear la subcategoría bajo el padre 'Costos'.
INSERT INTO transaction_categories (name, parent_id)
SELECT 'Compra de inventario (OC)', c.id
FROM transaction_categories c
WHERE c.name = 'Costos' AND c.parent_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM transaction_categories x WHERE x.name = 'Compra de inventario (OC)'
  );

-- 2. Reclasificar los pagos de OC que ya estaban cargados.
--    Son los que el frontend escribe con la descripción 'Pago OC - <proveedor>'
--    y los pagos de deuda a proveedor. Su costo se reconoce vía COGS al vender,
--    así que dejan de restar en la utilidad.
WITH destino AS (
  SELECT id FROM transaction_categories WHERE name = 'Compra de inventario (OC)'
)
UPDATE transactions t
SET subcategory_id = (SELECT id FROM destino)
WHERE t.voided_at IS NULL
  AND (t.description ILIKE 'Pago OC%' OR t.description ILIKE 'Pago deuda proveedor%')
  AND t.subcategory_id <> (SELECT id FROM destino);

-- 3. Auditoría.
DO $$
DECLARE
  v_admin uuid;
  v_rows  int;
BEGIN
  SELECT id INTO v_admin FROM profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'No hay usuario admin en profiles.';
  END IF;

  SELECT COUNT(*) INTO v_rows
  FROM transactions t
  JOIN transaction_categories c ON c.id = t.subcategory_id
  WHERE c.name = 'Compra de inventario (OC)' AND t.voided_at IS NULL;

  INSERT INTO user_action_logs (user_id, action, entity, entity_id, metadata)
  VALUES (v_admin, 'po_payments_recategorized', 'transaction_categories', NULL,
          jsonb_build_object('transacciones_reclasificadas', v_rows,
                             'motivo', 'Separar pago de OC de compras de gasto directo'));
END $$;

-- Verificación: qué quedó en cada categoría.
SELECT
  c.name                        AS categoria,
  COUNT(*)                      AS transacciones,
  SUM(t.amount)                 AS total,
  CASE WHEN c.name = 'Compra de inventario (OC)'
       THEN 'EXCLUIDA de la utilidad (costo llega por COGS)'
       ELSE 'cuenta como costo real' END AS tratamiento
FROM transactions t
JOIN transaction_categories c ON c.id = t.subcategory_id
WHERE t.voided_at IS NULL
  AND c.name IN ('Compra de inventario (OC)', 'Productos profesionales', 'Insumos', 'Productos (retail)')
GROUP BY c.name
ORDER BY c.name;
