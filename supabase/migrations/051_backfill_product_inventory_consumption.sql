-- Backfill retroactivo: consume inventario FIFO para ventas de producto históricas.
-- Idempotente: si ya existe inventory_movement referenciando la transacción, saltea.
-- Skip + log (user_action_logs) en: no_product_match, ambiguous_match, stock insuficiente.

DO $$
DECLARE
  v_tx RECORD;
  v_product_id UUID;
  v_match_count INT;
  v_author UUID;
  v_fallback UUID;
BEGIN
  SELECT id INTO v_fallback
  FROM profiles
  WHERE role = 'admin'
  ORDER BY created_at
  LIMIT 1;

  IF v_fallback IS NULL THEN
    RAISE EXCEPTION 'No admin user found in profiles — backfill cannot proceed without a fallback author.';
  END IF;

  FOR v_tx IN
    SELECT t.id, btrim(t.description) AS description, t.amount, t.created_by
    FROM transactions t
    JOIN transaction_categories c ON c.id = t.subcategory_id
    WHERE t.voided_at IS NULL
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
              jsonb_build_object('reason', 'no_product_match', 'description', v_tx.description));
      CONTINUE;
    END IF;

    IF v_match_count > 1 THEN
      INSERT INTO user_action_logs (user_id, action, entity, entity_id, metadata)
      VALUES (v_author, 'backfill_fifo_skipped', 'transactions', v_tx.id,
              jsonb_build_object('reason', 'ambiguous_match', 'description', v_tx.description, 'count', v_match_count));
      CONTINUE;
    END IF;

    BEGIN
      PERFORM consume_inventory_fifo(v_product_id, 1, v_tx.id, v_tx.amount, v_author);

      UPDATE transactions SET product_id = v_product_id WHERE id = v_tx.id;

      INSERT INTO user_action_logs (user_id, action, entity, entity_id, metadata)
      VALUES (v_author, 'backfill_fifo_applied', 'transactions', v_tx.id,
              jsonb_build_object('product_id', v_product_id, 'quantity', 1, 'unit_sale_price', v_tx.amount));
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO user_action_logs (user_id, action, entity, entity_id, metadata)
      VALUES (v_author, 'backfill_fifo_skipped', 'transactions', v_tx.id,
              jsonb_build_object('reason', SQLERRM, 'product_id', v_product_id));
    END;
  END LOOP;
END $$;
