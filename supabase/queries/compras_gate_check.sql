-- ============================================================
-- OJO: el editor de Supabase devuelve solo el resultado de la ÚLTIMA consulta
-- de un archivo con varias sentencias. Correr los bloques de a uno, o usar el
-- RESUMEN de acá abajo, que trae todo en un solo resultado.
-- ============================================================

-- ============================================================
-- RESUMEN — un solo run, todos los números
-- ============================================================
WITH pend AS (
  SELECT t.id, t.date, t.amount, t.product_id,
         p.sale_price,
         COALESCE(pws.stock, 0) AS stock
  FROM transactions t
  JOIN products p                   ON p.id = t.product_id
  LEFT JOIN products_with_stock pws ON pws.id = t.product_id
  WHERE t.inventory_pending = true
    AND t.voided_at IS NULL
)
SELECT 'ventas sin costo'                  AS chequeo, COUNT(*)::text AS valor FROM pend
UNION ALL SELECT 'de esas, parecen >1 unidad',
  COUNT(*)::text FROM pend WHERE COALESCE(sale_price,0) > 0 AND amount / sale_price > 1.5
UNION ALL SELECT 'de esas, sin stock hoy (se van a saltear)',
  COUNT(*)::text FROM pend WHERE stock < 1
UNION ALL SELECT 'productos distintos involucrados',
  COUNT(DISTINCT product_id)::text FROM pend
UNION ALL SELECT 'la mas vieja',
  COALESCE(MIN(date)::text, '-') FROM pend
UNION ALL SELECT '--- compras ---', ''
UNION ALL SELECT 'pedidos recibidos este mes',
  COUNT(*)::text FROM purchase_orders
  WHERE status = 'received' AND order_date >= date_trunc('month', CURRENT_DATE)
UNION ALL SELECT 'pagos de OC registrados',
  COUNT(*)::text FROM transactions
  WHERE voided_at IS NULL AND description ILIKE 'Pago OC%'
UNION ALL SELECT 'PROBLEMA: pagos de deuda sin transaccion',
  COUNT(*)::text FROM supplier_debt_payments WHERE transaction_id IS NULL
UNION ALL SELECT 'deudas a proveedor abiertas',
  COUNT(*)::text FROM supplier_debts WHERE total_amount - paid_amount > 0;

-- ============================================================
-- PARTE 0 — Verificar que los pedidos y los pagos quedaron bien cargados
--           (correr cada bloque por separado)
-- ============================================================

-- A) Los pedidos recibidos y su lote, con el costo ya prorrateado por flete.
SELECT
  po.id,
  s.name                        AS proveedor,
  po.order_date,
  po.status,
  po.shipping_cost,
  po.discount_amount,
  COUNT(poi.id)                 AS items,
  SUM(poi.quantity * poi.unit_cost) AS subtotal_items,
  COUNT(il.id)                  AS lotes_creados,
  SUM(il.initial_quantity * il.unit_cost) AS valor_lotes_con_flete
FROM purchase_orders po
LEFT JOIN suppliers s            ON s.id = po.supplier_id
LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
LEFT JOIN inventory_lots il      ON il.purchase_order_item_id = poi.id
WHERE po.order_date >= date_trunc('month', CURRENT_DATE)
GROUP BY po.id, s.name, po.order_date, po.status, po.shipping_cost, po.discount_amount
ORDER BY po.order_date DESC;

-- B) Las transacciones de pago creadas, y si movieron caja.
--    Si `movimientos_pago` es 0, ese pago NO descontó plata de ningún lado.
SELECT
  t.date,
  t.description,
  t.amount,
  c.name                        AS categoria,
  COUNT(tp.id)                  AS movimientos_pago,
  string_agg(tp.payment_method || ' (' || tp.type || ')', ', ') AS detalle
FROM transactions t
LEFT JOIN transaction_categories c ON c.id = t.subcategory_id
LEFT JOIN transaction_payments tp  ON tp.transaction_id = t.id
WHERE t.voided_at IS NULL
  AND (t.description ILIKE 'Pago OC%' OR t.description ILIKE 'Pago deuda proveedor%')
GROUP BY t.id, t.date, t.description, t.amount, c.name
ORDER BY t.date DESC;

-- C) Pagos de deuda a proveedor SIN transacción vinculada.
--    Cada fila acá es plata que salió en la realidad y el sistema no descontó.
SELECT
  sdp.date,
  s.name        AS proveedor,
  sdp.amount,
  sdp.payment_method,
  'FALTA TRANSACCION' AS problema
FROM supplier_debt_payments sdp
LEFT JOIN supplier_debts sd ON sd.id = sdp.debt_id
LEFT JOIN suppliers s       ON s.id = sd.supplier_id
WHERE sdp.transaction_id IS NULL
ORDER BY sdp.date DESC;

-- D) Deudas a proveedor abiertas (las que quedaron a deber).
SELECT
  s.name        AS proveedor,
  sd.total_amount,
  sd.paid_amount,
  sd.total_amount - sd.paid_amount AS pendiente,
  sd.due_date
FROM supplier_debts sd
LEFT JOIN suppliers s ON s.id = sd.supplier_id
WHERE sd.total_amount - sd.paid_amount > 0
ORDER BY sd.due_date NULLS LAST;

-- ============================================================
-- PARTE 1 — Ventas sin costo registrado (paso 4 del plan)
--
-- Estas son las ventas que se registraron cuando el sistema no tenía stock:
-- FIFO se salteó, no se creó sale_items, y por lo tanto NO tienen costo.
-- Hoy están inflando la utilidad (100% de margen).
--
-- CORRER DESPUÉS de recibir los 3 pedidos, para que la columna
-- "alcanza_stock" tenga sentido.
--
-- Revisar la columna `cantidad_implicita`: si no da ~1, esa venta fue de
-- más de una unidad y hay que corregirla a mano después del backfill.
-- ============================================================

SELECT
  t.date                                   AS fecha,
  p.name                                   AS producto,
  p.sku,
  t.amount                                 AS monto,
  p.sale_price                             AS precio_lista,
  CASE
    WHEN COALESCE(p.sale_price, 0) > 0
    THEN ROUND(t.amount / p.sale_price, 2)
    ELSE NULL
  END                                      AS cantidad_implicita,
  COALESCE(pws.stock, 0)                   AS stock_actual,
  CASE WHEN COALESCE(pws.stock, 0) >= 1 THEN 'sí' ELSE 'NO' END AS alcanza_stock,
  t.id                                     AS transaction_id
FROM transactions t
JOIN products p              ON p.id = t.product_id
LEFT JOIN products_with_stock pws ON pws.id = t.product_id
WHERE t.inventory_pending = true
  AND t.voided_at IS NULL
ORDER BY t.date, p.name;

-- Resumen: cuántas son y cuántas parecen ser de más de 1 unidad.
SELECT
  COUNT(*)                                                          AS total_ventas_sin_costo,
  COUNT(*) FILTER (WHERE COALESCE(p.sale_price, 0) > 0
                     AND ROUND(t.amount / p.sale_price, 2) > 1.5)   AS parecen_mas_de_1_unidad,
  COUNT(*) FILTER (WHERE t.product_id IS NULL)                      AS sin_producto_asignado,
  COUNT(DISTINCT t.product_id)                                      AS productos_distintos
FROM transactions t
LEFT JOIN products p ON p.id = t.product_id
WHERE t.inventory_pending = true
  AND t.voided_at IS NULL;

-- Control de cobertura: la marca inventory_pending se puso sobre categorías
-- 'Producto' O con deducts_inventory = true, pero los backfills viejos solo
-- escaneaban dos nombres fijos. Esto muestra qué categorías están en juego.
SELECT
  c.name                    AS categoria,
  c.deducts_inventory,
  COUNT(*)                  AS ventas_pendientes
FROM transactions t
JOIN transaction_categories c ON c.id = t.subcategory_id
WHERE t.inventory_pending = true
  AND t.voided_at IS NULL
GROUP BY c.name, c.deducts_inventory
ORDER BY 3 DESC;
