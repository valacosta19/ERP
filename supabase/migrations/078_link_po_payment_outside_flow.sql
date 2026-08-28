-- ============================================================
-- Enlaza los pagos de OC que se cargaron por fuera del flujo de la orden.
--
-- La 076 y la 077 solo miraban transacciones con descripción 'Pago OC%', que es
-- la que escribe la app al recibir con pago inmediato. Pero un pago cargado a
-- mano como gasto común no sigue esa plantilla — el caso concreto es
-- 'Pago a proveedor (Fanatic Barber)' — y quedaba invisible para el cruce.
--
-- Acá el cruce va por monto exacto contra el total recibido de la OC, sin mirar
-- la descripción, exigiendo unicidad estricta en ambos sentidos y que la
-- transacción sea un egreso todavía sin reclamar. Un importe con centavos que
-- coincide exacto contra una única OC no es casualidad plausible; si hubiera
-- más de un candidato, no se enlaza nada.
--
-- Lo que quede en null después de esta migración son OCs que recibieron
-- mercadería sin que se registrara nunca la salida de plata. Eso no es un
-- vínculo faltante sino un gasto sin cargar, y no se resuelve por SQL.
--
-- El filtro por categoría es deliberadamente laxo (solo descarta ingresos): si
-- la subcategoría tuviera el transaction_type sin cargar, un join estricto
-- descartaría el pago en silencio. La garantía es el monto y la unicidad.
-- ============================================================

WITH po_pending AS (
  SELECT po.id AS po_id,
         round(COALESCE(SUM(l.initial_quantity * poi.unit_cost), 0)
               + COALESCE(po.shipping_cost, 0) - COALESCE(po.discount_amount, 0), 2) AS total
  FROM purchase_orders po
  LEFT JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
  LEFT JOIN inventory_lots l ON l.id = poi.lot_id
  WHERE po.payment_transaction_id IS NULL
    AND po.status = 'received'
    AND NOT EXISTS (SELECT 1 FROM supplier_debts d WHERE d.purchase_order_id = po.id)
  GROUP BY po.id, po.shipping_cost, po.discount_amount
),
candidates AS (
  SELECT p.po_id, t.id AS transaction_id
  FROM po_pending p
  JOIN transactions t ON t.voided_at IS NULL AND round(t.amount, 2) = p.total
  LEFT JOIN transaction_categories c ON c.id = t.subcategory_id
  WHERE p.total > 0
    AND COALESCE(c.transaction_type, 'expense') <> 'income'
    AND NOT EXISTS (SELECT 1 FROM purchase_orders po2 WHERE po2.payment_transaction_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM supplier_debt_payments sp WHERE sp.transaction_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM receivable_collections rc WHERE rc.transaction_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM reserve_movements rm WHERE rm.transaction_id = t.id)
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
