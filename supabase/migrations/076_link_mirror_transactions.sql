-- ============================================================
-- Vincula cada transacción espejo con la fila de dominio que la originó.
--
-- Dos flujos creaban una transacción sin ningún id que la enlazara: el
-- movimiento de reserva (Fondos) y el pago inmediato de una orden de compra.
-- En ambos la única correlación era la descripción más fecha y monto, que no
-- identifica. Sin el vínculo, anular la transacción deja la fila de dominio
-- intacta y el monto contado dos veces, sin forma de detectarlo.
--
-- La dirección sigue el patrón de las ocho columnas que ya existen en el
-- esquema: la fila de dominio guarda el transaction_id, nunca al revés.
--
-- Ninguna columna es NOT NULL: hay filas históricas sin espejo posible (la
-- reserva restaurada en 048 nunca tuvo transacción). Un null significa "no hay
-- transacción", y es preferible a un enlace inventado.
-- ============================================================

ALTER TABLE reserve_movements
  ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_reserve_movements_transaction_id
  ON reserve_movements(transaction_id) WHERE transaction_id IS NOT NULL;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS payment_transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_payment_transaction_id
  ON purchase_orders(payment_transaction_id) WHERE payment_transaction_id IS NOT NULL;

-- ------------------------------------------------------------
-- Backfill de reservas.
-- Las descripciones son las de 036_backfill_reserve_transactions.sql, idénticas
-- a las que arma useReserveMovements hoy. Esos espejos siguen en la tabla: 037
-- borró solo filas con type IN ('income','expense') y 036 las insertó como
-- 'transfer'.
-- Solo se enlaza donde el match es único en ambos sentidos.
-- ------------------------------------------------------------
WITH candidates AS (
  SELECT m.id AS movement_id, t.id AS transaction_id
  FROM reserve_movements m
  JOIN reserve_accounts a ON a.id = m.reserve_id
  JOIN transactions t
    ON t.date = m.date
   AND t.amount = abs(m.amount)
   AND t.voided_at IS NULL
   AND t.description = CASE WHEN m.amount > 0
         THEN 'Transferencia → ' || a.name
         ELSE 'Retorno ← ' || a.name END
  WHERE m.transaction_id IS NULL
),
unique_pairs AS (
  SELECT movement_id, transaction_id
  FROM candidates
  WHERE movement_id IN (SELECT movement_id FROM candidates GROUP BY movement_id HAVING count(*) = 1)
    AND transaction_id IN (SELECT transaction_id FROM candidates GROUP BY transaction_id HAVING count(*) = 1)
)
UPDATE reserve_movements m
SET transaction_id = u.transaction_id
FROM unique_pairs u
WHERE m.id = u.movement_id;

-- ------------------------------------------------------------
-- Backfill de pagos inmediatos de OC.
-- La descripción es la de usePurchaseOrders: 'Pago OC - {proveedor}', con el
-- sufijo recortado cuando el proveedor no tiene nombre. El monto pagado no
-- queda guardado en la OC (depende de qué items se recibieron), así que el
-- cruce va por descripción y categoría, y solo enlaza cuando el proveedor tiene
-- exactamente una OC recibida sin enlazar y exactamente un pago sin reclamar.
-- Cualquier ambigüedad queda en null a propósito.
-- ------------------------------------------------------------
WITH po_candidates AS (
  SELECT po.id AS po_id, t.id AS transaction_id
  FROM purchase_orders po
  LEFT JOIN suppliers s ON s.id = po.supplier_id
  JOIN transaction_categories c ON c.name = 'Compra de inventario (OC)'
  JOIN transactions t
    ON t.voided_at IS NULL
   AND t.subcategory_id = c.id
   AND t.description = CASE WHEN COALESCE(s.name, '') = ''
         THEN 'Pago OC -' ELSE 'Pago OC - ' || s.name END
  WHERE po.payment_transaction_id IS NULL
    AND po.status = 'received'
    AND NOT EXISTS (SELECT 1 FROM supplier_debts d WHERE d.purchase_order_id = po.id)
    AND NOT EXISTS (SELECT 1 FROM purchase_orders p2 WHERE p2.payment_transaction_id = t.id)
),
unique_po_pairs AS (
  SELECT po_id, transaction_id
  FROM po_candidates
  WHERE po_id IN (SELECT po_id FROM po_candidates GROUP BY po_id HAVING count(*) = 1)
    AND transaction_id IN (SELECT transaction_id FROM po_candidates GROUP BY transaction_id HAVING count(*) = 1)
)
UPDATE purchase_orders po
SET payment_transaction_id = u.transaction_id
FROM unique_po_pairs u
WHERE po.id = u.po_id;

-- ------------------------------------------------------------
-- Edición atómica de un movimiento de reserva.
-- Actualiza el movimiento respetando su signo original (la dirección no se
-- edita) y, si existe y no está anulada, su transacción espejo.
-- Devuelve si el espejo fue actualizado, para que la UI pueda avisar cuando la
-- reserva no tiene transacción asociada o la tiene anulada.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_reserve_movement(
  p_id uuid, p_amount numeric, p_date date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_amount     numeric(12,2);
  v_transaction_id uuid;
  v_new_amount     numeric(12,2);
  v_mirror_updated boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'Solo un administrador puede editar movimientos de reserva.'; END IF;

  IF p_amount IS NULL OR round(p_amount, 2) <= 0 OR p_date IS NULL THEN
    RAISE EXCEPTION 'El importe y la fecha son obligatorios.';
  END IF;

  SELECT amount, transaction_id INTO v_old_amount, v_transaction_id
  FROM reserve_movements WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El movimiento de reserva no existe.'; END IF;

  v_new_amount := CASE WHEN v_old_amount < 0
    THEN -round(p_amount, 2) ELSE round(p_amount, 2) END;

  UPDATE reserve_movements
  SET amount = v_new_amount, date = p_date
  WHERE id = p_id;

  IF v_transaction_id IS NOT NULL THEN
    UPDATE transactions
    SET amount = abs(v_new_amount), date = p_date
    WHERE id = v_transaction_id AND voided_at IS NULL;
    v_mirror_updated := FOUND;
  END IF;

  RETURN jsonb_build_object('mirror_updated', v_mirror_updated);
END;
$$;

REVOKE ALL ON FUNCTION update_reserve_movement(uuid, numeric, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_reserve_movement(uuid, numeric, date) TO authenticated;

-- ------------------------------------------------------------
-- Consulta de huérfanos. Correr después del backfill, y ante cualquier sospecha
-- de drift, para saber qué quedó sin enlazar.
--
-- SELECT 'reserva' AS origen, m.id, m.date, m.amount, a.name
-- FROM reserve_movements m
-- JOIN reserve_accounts a ON a.id = m.reserve_id
-- WHERE m.transaction_id IS NULL
-- UNION ALL
-- SELECT 'orden de compra', po.id, po.created_at::date, null, s.name
-- FROM purchase_orders po
-- LEFT JOIN suppliers s ON s.id = po.supplier_id
-- LEFT JOIN supplier_debts d ON d.purchase_order_id = po.id
-- WHERE po.payment_transaction_id IS NULL
--   AND po.status = 'received'
--   AND d.id IS NULL;   -- las diferidas se rastrean por supplier_debts
-- ------------------------------------------------------------
