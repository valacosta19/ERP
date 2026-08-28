-- ============================================================
-- Completa el backfill de purchase_orders.payment_transaction_id que la 076
-- dejó en cero.
--
-- La 076 cruzaba solo por descripción, y 'Pago OC - Glavic' no distingue cuál
-- de las siete OCs de ese proveedor es. Con la ambigüedad, la CTE de unicidad
-- descartó las 42 combinaciones — el comportamiento correcto, pero el cruce
-- estaba incompleto: le faltaba el monto.
--
-- Dos pasadas, cada una exigiendo unicidad estricta en ambos sentidos:
--   1. descripción + monto exacto. Es la fuerte y resuelve la mayoría.
--   2. descripción + fecha exacta, solo sobre lo que quedó suelto. Es más
--      débil — la fecha del pago no tiene por qué ser la de la OC — y existe
--      para el caso del importe redondeado a mano al pagar.
--
-- Lo que ninguna de las dos resuelve queda en null: hay OCs recibidas que
-- nunca tuvieron pago asociado.
--
-- El monto de la OC se reconstruye igual que lo calculaba la app al recibir:
-- cantidad recibida (initial_quantity del lote) × unit_cost del ítem, más
-- flete, menos descuento.
-- ============================================================

-- Pasada 1: descripción + monto exacto.
WITH po_pending AS (
  SELECT po.id AS po_id,
         CASE WHEN COALESCE(s.name, '') = ''
              THEN 'Pago OC -' ELSE 'Pago OC - ' || s.name END AS descripcion,
         po.order_date,
         round(COALESCE(SUM(l.initial_quantity * poi.unit_cost), 0)
               + COALESCE(po.shipping_cost, 0) - COALESCE(po.discount_amount, 0), 2) AS total
  FROM purchase_orders po
  LEFT JOIN suppliers s ON s.id = po.supplier_id
  LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
  LEFT JOIN inventory_lots l ON l.id = poi.lot_id
  WHERE po.payment_transaction_id IS NULL
    AND po.status = 'received'
    AND NOT EXISTS (SELECT 1 FROM supplier_debts d WHERE d.purchase_order_id = po.id)
  GROUP BY po.id, s.name, po.order_date, po.shipping_cost, po.discount_amount
),
candidates AS (
  SELECT p.po_id, t.id AS transaction_id
  FROM po_pending p
  JOIN transactions t
    ON t.voided_at IS NULL
   AND t.description = p.descripcion
   AND round(t.amount, 2) = p.total
  WHERE NOT EXISTS (SELECT 1 FROM purchase_orders po2 WHERE po2.payment_transaction_id = t.id)
),
unique_pairs AS (
  SELECT po_id, transaction_id FROM candidates
  WHERE po_id IN (SELECT po_id FROM candidates GROUP BY po_id HAVING count(*) = 1)
    AND transaction_id IN (SELECT transaction_id FROM candidates GROUP BY transaction_id HAVING count(*) = 1)
)
UPDATE purchase_orders po
SET payment_transaction_id = u.transaction_id
FROM unique_pairs u
WHERE po.id = u.po_id;

-- Pasada 2: descripción + fecha exacta. po_pending se recalcula, así que lo que
-- enlazó la pasada 1 ya no entra.
WITH po_pending AS (
  SELECT po.id AS po_id,
         CASE WHEN COALESCE(s.name, '') = ''
              THEN 'Pago OC -' ELSE 'Pago OC - ' || s.name END AS descripcion,
         po.order_date
  FROM purchase_orders po
  LEFT JOIN suppliers s ON s.id = po.supplier_id
  WHERE po.payment_transaction_id IS NULL
    AND po.status = 'received'
    AND NOT EXISTS (SELECT 1 FROM supplier_debts d WHERE d.purchase_order_id = po.id)
),
candidates AS (
  SELECT p.po_id, t.id AS transaction_id
  FROM po_pending p
  JOIN transactions t
    ON t.voided_at IS NULL
   AND t.description = p.descripcion
   AND t.date = p.order_date
  WHERE NOT EXISTS (SELECT 1 FROM purchase_orders po2 WHERE po2.payment_transaction_id = t.id)
),
unique_pairs AS (
  SELECT po_id, transaction_id FROM candidates
  WHERE po_id IN (SELECT po_id FROM candidates GROUP BY po_id HAVING count(*) = 1)
    AND transaction_id IN (SELECT transaction_id FROM candidates GROUP BY transaction_id HAVING count(*) = 1)
)
UPDATE purchase_orders po
SET payment_transaction_id = u.transaction_id
FROM unique_pairs u
WHERE po.id = u.po_id;
