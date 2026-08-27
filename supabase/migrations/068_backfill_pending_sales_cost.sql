-- ============================================================
-- Ventas que quedaron marcadas como "sin descontar inventario".
--
-- PRERREQUISITO: los pedidos de compra de julio tienen que estar RECIBIDOS
-- antes de correr esto (hecho). Estas ventas quedaron pendientes porque no
-- había stock; sin los lotes, cada fila fallaría con 'Stock insuficiente'.
--
-- ORDEN OBLIGATORIO: recibir pedidos → este backfill → contar → recuento (065).
-- consume_inventory_fifo NO filtra por fecha de venta, y apply_inventory_recount
-- pone todos los lotes en cero. Si esto corre DESPUÉS del recuento, las ventas
-- viejas se comen el lote nuevo y descuentan las mismas unidades dos veces.
--
-- ------------------------------------------------------------
-- DOS PASADAS, y la distinción importa:
--
-- PASADA A — ventas desde 2026-07-01 con product_id: se les corre FIFO y se
--   les asigna el costo real del lote. Son las atadas a los 3 pedidos de julio.
--
-- PASADA B — todo el resto de las pendientes (anteriores a julio, y las que no
--   tienen product_id): se les limpia la marca SIN correr FIFO.
--   Motivo: hasta mayo la compra de esos productos se cargaba como gasto
--   directo, sin orden de compra — el modelo de "transacción directa" de
--   docs/accounting.md §16. Su costo YA está en el resultado como egreso.
--   Asignarles COGS ahora contaría el costo DOS VECES y desinflaría la
--   utilidad de febrero a junio.
--   Además FIFO tomaría el costo del lote de HOY para una venta de febrero,
--   que no es el costo de entonces.
--
-- NO agregar una pasada por descripción (como la 053) para las que no tienen
-- product_id: justamente esas son las de la época de gasto directo.
-- ------------------------------------------------------------

DO $$
DECLARE
  v_tx        RECORD;
  v_author    uuid;
  v_fallback  uuid;
  v_cutoff    date := DATE '2026-07-01';
BEGIN
  SELECT id INTO v_fallback
  FROM profiles
  WHERE role = 'admin'
  ORDER BY created_at
  LIMIT 1;

  IF v_fallback IS NULL THEN
    RAISE EXCEPTION 'No hay usuario admin en profiles — el backfill no puede continuar.';
  END IF;

  -- ── PASADA A: julio en adelante, con producto → FIFO + costo real ──
  FOR v_tx IN
    SELECT t.id, t.amount, t.product_id, t.created_by, t.date
    FROM transactions t
    WHERE t.inventory_pending = true
      AND t.voided_at IS NULL
      AND t.product_id IS NOT NULL
      AND t.date >= v_cutoff
      AND NOT EXISTS (
        SELECT 1 FROM inventory_movements im
        WHERE im.reference_id = t.id AND im.reference_type = 'transaction'
      )
    ORDER BY t.date
  LOOP
    v_author := COALESCE(v_tx.created_by, v_fallback);

    BEGIN
      -- Cantidad 1: transactions no guarda la cantidad vendida (vivía en
      -- sale_items, que nunca se creó). Las excepciones se corrigen a mano.
      PERFORM consume_inventory_fifo(v_tx.product_id, 1, v_tx.id, v_tx.amount, v_author);

      UPDATE transactions SET inventory_pending = false WHERE id = v_tx.id;

      INSERT INTO user_action_logs (user_id, action, entity, entity_id, metadata)
      VALUES (v_author, 'backfill_pending_sale_applied', 'transactions', v_tx.id,
              jsonb_build_object('pasada', 'A', 'product_id', v_tx.product_id,
                                 'fecha', v_tx.date, 'cantidad', 1));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO user_action_logs (user_id, action, entity, entity_id, metadata)
      VALUES (v_author, 'backfill_pending_sale_skipped', 'transactions', v_tx.id,
              jsonb_build_object('pasada', 'A', 'product_id', v_tx.product_id,
                                 'fecha', v_tx.date, 'motivo', SQLERRM));
    END;
  END LOOP;

  -- ── PASADA B: el resto → solo limpiar la marca, sin tocar inventario ──
  FOR v_tx IN
    SELECT t.id, t.product_id, t.created_by, t.date
    FROM transactions t
    WHERE t.inventory_pending = true
      AND t.voided_at IS NULL
      AND (t.date < v_cutoff OR t.product_id IS NULL)
    ORDER BY t.date
  LOOP
    v_author := COALESCE(v_tx.created_by, v_fallback);

    UPDATE transactions SET inventory_pending = false WHERE id = v_tx.id;

    INSERT INTO user_action_logs (user_id, action, entity, entity_id, metadata)
    VALUES (v_author, 'backfill_pending_sale_closed_no_fifo', 'transactions', v_tx.id,
            jsonb_build_object('pasada', 'B', 'product_id', v_tx.product_id,
                               'fecha', v_tx.date,
                               'motivo', 'Epoca de compra como gasto directo: el costo ya esta en el resultado'));
  END LOOP;
END $$;

-- Resumen de lo que hizo, y qué quedó pendiente (debería ser 0).
SELECT 'A: con costo asignado (FIFO)' AS resultado,
       COUNT(*)::text AS cantidad
FROM user_action_logs
WHERE action = 'backfill_pending_sale_applied' AND created_at >= now() - INTERVAL '5 minutes'
UNION ALL
SELECT 'A: salteadas por error', COUNT(*)::text
FROM user_action_logs
WHERE action = 'backfill_pending_sale_skipped' AND created_at >= now() - INTERVAL '5 minutes'
UNION ALL
SELECT 'B: marca limpiada sin FIFO', COUNT(*)::text
FROM user_action_logs
WHERE action = 'backfill_pending_sale_closed_no_fifo' AND created_at >= now() - INTERVAL '5 minutes'
UNION ALL
SELECT 'quedan pendientes (deberia ser 0)', COUNT(*)::text
FROM transactions
WHERE inventory_pending = true AND voided_at IS NULL
UNION ALL
SELECT 'motivo de las salteadas',
       COALESCE(string_agg(DISTINCT metadata->>'motivo', ' | '), '-')
FROM user_action_logs
WHERE action = 'backfill_pending_sale_skipped' AND created_at >= now() - INTERVAL '5 minutes';
