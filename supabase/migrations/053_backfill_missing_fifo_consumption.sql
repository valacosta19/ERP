-- Backfill FIFO para transacciones con inventario no descontado.
-- Corre en dos pasadas:
--   Pasada A: transacciones con product_id ya seteado → FIFO directo, sin ambigüedad.
--   Pasada B: transacciones sin product_id → intenta matchear descripción con nombre de producto.
-- Idempotente: saltea cualquier transacción que ya tenga inventory_movement referenciándola.
-- Loguea cada acción en user_action_logs.

DO $$
DECLARE
  v_tx        RECORD;
  v_product   RECORD;
  v_match_count INT;
  v_product_id  UUID;
  v_author      UUID;
  v_fallback    UUID;
BEGIN
  SELECT id INTO v_fallback
  FROM profiles
  WHERE role = 'admin'
  ORDER BY created_at
  LIMIT 1;

  IF v_fallback IS NULL THEN
    RAISE EXCEPTION 'No admin user found in profiles — backfill cannot proceed.';
  END IF;

  -- ──────────────────────────────────────────────────────────────
  -- PASADA A: transacciones con product_id seteado y sin movimiento
  -- ──────────────────────────────────────────────────────────────
  FOR v_tx IN
    SELECT t.id, t.amount, t.product_id, t.created_by
    FROM transactions t
    JOIN transaction_categories c ON c.id = t.subcategory_id
    WHERE t.voided_at IS NULL
      AND t.product_id IS NOT NULL
      AND c.name IN ('Producto', 'Consumos y cortesías')
      AND NOT EXISTS (
        SELECT 1 FROM inventory_movements im
        WHERE im.reference_id = t.id AND im.reference_type = 'transaction'
      )
  LOOP
    v_author := COALESCE(v_tx.created_by, v_fallback);

    BEGIN
      PERFORM consume_inventory_fifo(v_tx.product_id, 1, v_tx.id, v_tx.amount, v_author);
      INSERT INTO user_action_logs (user_id, action, entity, entity_id, metadata)
      VALUES (v_author, 'backfill_fifo_applied', 'transactions', v_tx.id,
              jsonb_build_object('pasada', 'A', 'product_id', v_tx.product_id));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO user_action_logs (user_id, action, entity, entity_id, metadata)
      VALUES (v_author, 'backfill_fifo_skipped', 'transactions', v_tx.id,
              jsonb_build_object('pasada', 'A', 'reason', SQLERRM, 'product_id', v_tx.product_id));
    END;
  END LOOP;

  -- ──────────────────────────────────────────────────────────────
  -- PASADA B: transacciones sin product_id → match por descripción
  -- ──────────────────────────────────────────────────────────────
  FOR v_tx IN
    SELECT t.id, btrim(t.description) AS description, t.amount, t.created_by
    FROM transactions t
    JOIN transaction_categories c ON c.id = t.subcategory_id
    WHERE t.voided_at IS NULL
      AND t.product_id IS NULL
      AND c.name IN ('Producto', 'Consumos y cortesías')
      AND NOT EXISTS (
        SELECT 1 FROM inventory_movements im
        WHERE im.reference_id = t.id AND im.reference_type = 'transaction'
      )
  LOOP
    v_author := COALESCE(v_tx.created_by, v_fallback);

    SELECT COUNT(*), (array_agg(id))[1]
      INTO v_match_count, v_product_id
    FROM products
    WHERE deleted_at IS NULL
      AND (v_tx.description = name || ' ' || COALESCE(unit, '')
           OR v_tx.description = name);

    IF v_match_count = 0 THEN
      INSERT INTO user_action_logs (user_id, action, entity, entity_id, metadata)
      VALUES (v_author, 'backfill_fifo_skipped', 'transactions', v_tx.id,
              jsonb_build_object('pasada', 'B', 'reason', 'no_product_match', 'description', v_tx.description));
      CONTINUE;
    END IF;

    IF v_match_count > 1 THEN
      INSERT INTO user_action_logs (user_id, action, entity, entity_id, metadata)
      VALUES (v_author, 'backfill_fifo_skipped', 'transactions', v_tx.id,
              jsonb_build_object('pasada', 'B', 'reason', 'ambiguous_match', 'description', v_tx.description, 'count', v_match_count));
      CONTINUE;
    END IF;

    BEGIN
      PERFORM consume_inventory_fifo(v_product_id, 1, v_tx.id, v_tx.amount, v_author);
      UPDATE transactions SET product_id = v_product_id WHERE id = v_tx.id;
      INSERT INTO user_action_logs (user_id, action, entity, entity_id, metadata)
      VALUES (v_author, 'backfill_fifo_applied', 'transactions', v_tx.id,
              jsonb_build_object('pasada', 'B', 'product_id', v_product_id, 'description', v_tx.description));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO user_action_logs (user_id, action, entity, entity_id, metadata)
      VALUES (v_author, 'backfill_fifo_skipped', 'transactions', v_tx.id,
              jsonb_build_object('pasada', 'B', 'reason', SQLERRM, 'product_id', v_product_id));
    END;
  END LOOP;
END $$;

-- Ver resumen de lo que hizo el backfill
SELECT action, metadata->>'pasada' AS pasada, metadata->>'reason' AS motivo_skip, COUNT(*)
FROM user_action_logs
WHERE action IN ('backfill_fifo_applied', 'backfill_fifo_skipped')
  AND created_at >= NOW() - INTERVAL '5 minutes'
GROUP BY action, metadata->>'pasada', metadata->>'reason'
ORDER BY action, pasada;
