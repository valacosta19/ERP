-- ============================================================
-- Cerrar las ventas pendientes de productos que NUNCA fueron inventario.
--
-- Quedaron 4 ventas de julio marcadas como pendientes después de la 068,
-- todas por 'Stock insuficiente'. Al revisarlas:
--
--   - Bemdita Ghee Hidratacion Mascarilla → 0 lotes en toda su historia
--   - Hidratante CG Shampoo              → 0 lotes en toda su historia
--   - Danoz Voracez Mascarilla           → tuvo 1 lote de OC (marzo), agotado
--
-- Los dos primeros nunca entraron al sistema como inventario: son del modelo
-- de "transacción directa" (docs/accounting.md §16), su costo ya está en el
-- resultado como gasto. Asignarles COGS lo contaría dos veces.
--
-- Danoz NO se toca acá: es el único caso donde el costo puede faltar de verdad
-- y quedó pendiente de decisión. Se resuelve a mano, registrando un gasto en
-- 'Costos > Insumos' si se confirma que su reposición nunca se cargó.
-- NO usar 'Consumos y cortesías' para eso: tiene deducts_inventory = true y
-- volvería a descontar stock.
--
-- El criterio general, para no repetir el error: una venta pendiente de un
-- producto SIN ningún lote histórico no necesita COGS.
-- ============================================================

DO $$
DECLARE
  v_tx       RECORD;
  v_author   uuid;
  v_fallback uuid;
BEGIN
  SELECT id INTO v_fallback
  FROM profiles
  WHERE role = 'admin'
  ORDER BY created_at
  LIMIT 1;

  IF v_fallback IS NULL THEN
    RAISE EXCEPTION 'No hay usuario admin en profiles — no se puede registrar la auditoría.';
  END IF;

  FOR v_tx IN
    SELECT t.id, t.date, t.product_id, t.created_by, p.name AS product_name
    FROM transactions t
    JOIN products p ON p.id = t.product_id
    WHERE t.inventory_pending = true
      AND t.voided_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM inventory_lots il WHERE il.product_id = t.product_id
      )
    ORDER BY t.date
  LOOP
    v_author := COALESCE(v_tx.created_by, v_fallback);

    UPDATE transactions SET inventory_pending = false WHERE id = v_tx.id;

    INSERT INTO user_action_logs (user_id, action, entity, entity_id, metadata)
    VALUES (v_author, 'pending_sale_closed_never_inventory', 'transactions', v_tx.id,
            jsonb_build_object('product_id', v_tx.product_id,
                               'producto', v_tx.product_name,
                               'fecha', v_tx.date,
                               'motivo', 'Producto sin ningun lote historico: costo ya cargado como gasto directo'));
  END LOOP;
END $$;

-- Qué cerró y qué queda.
SELECT 'cerradas (producto sin lotes)' AS resultado, COUNT(*)::text AS cantidad
FROM user_action_logs
WHERE action = 'pending_sale_closed_never_inventory'
  AND created_at >= now() - INTERVAL '5 minutes'
UNION ALL
SELECT 'quedan pendientes', COUNT(*)::text
FROM transactions
WHERE inventory_pending = true AND voided_at IS NULL;

-- Detalle de lo que queda pendiente (deberia ser solo Danoz Voracez).
SELECT t.date, p.name AS producto, t.amount
FROM transactions t
LEFT JOIN products p ON p.id = t.product_id
WHERE t.inventory_pending = true AND t.voided_at IS NULL
ORDER BY t.date;
