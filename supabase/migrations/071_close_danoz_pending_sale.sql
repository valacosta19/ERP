-- ============================================================
-- Cerrar la última venta pendiente (Danoz Voracez Mascarilla, 2026-07-23).
--
-- Es el único caso que quedó después de la 068/069. El producto SÍ fue
-- inventario gestionado (1 lote de OC en marzo 2026, costo $13.529,90), pero
-- se agotó y la venta de julio salió de stock que el sistema ya no tenía.
--
-- Decisión: NO se le asigna costo, solo se limpia la marca.
-- Motivo: no hay forma de saber si la reposición se cargó o no. En el período
-- hay compras de gasto directo sin detalle por producto — en particular
-- 'pago Ukiyo factura 3693' (2026-05-04, $643.323,20) — donde la reposición
-- de este producto pudo estar incluida. Frente a esa ambigüedad, agregar
-- $13.529,90 de COGS arriesga contar el costo dos veces, y el monto no
-- justifica el riesgo.
--
-- Si más adelante se confirma que la reposición nunca se cargó, corresponde
-- registrar el costo como gasto en 'Costos > Insumos' con fecha 2026-07-23.
-- NO usar 'Consumos y cortesías': tiene deducts_inventory = true y volvería a
-- descontar stock.
-- ============================================================

DO $$
DECLARE
  v_tx       RECORD;
  v_author   uuid;
  v_fallback uuid;
BEGIN
  SELECT id INTO v_fallback FROM profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1;
  IF v_fallback IS NULL THEN
    RAISE EXCEPTION 'No hay usuario admin en profiles.';
  END IF;

  FOR v_tx IN
    SELECT t.id, t.date, t.amount, t.product_id, t.created_by, p.name AS product_name
    FROM transactions t
    JOIN products p ON p.id = t.product_id
    WHERE t.inventory_pending = true
      AND t.voided_at IS NULL
  LOOP
    v_author := COALESCE(v_tx.created_by, v_fallback);

    UPDATE transactions SET inventory_pending = false WHERE id = v_tx.id;

    INSERT INTO user_action_logs (user_id, action, entity, entity_id, metadata)
    VALUES (v_author, 'pending_sale_closed_cost_undetermined', 'transactions', v_tx.id,
            jsonb_build_object('product_id', v_tx.product_id,
                               'producto', v_tx.product_name,
                               'fecha', v_tx.date,
                               'venta', v_tx.amount,
                               'motivo', 'Reposicion no identificable: pudo estar en una compra de gasto directo sin detalle'));
  END LOOP;
END $$;

-- Tiene que dar 0.
SELECT COUNT(*) AS ventas_pendientes_restantes
FROM transactions
WHERE inventory_pending = true AND voided_at IS NULL;
