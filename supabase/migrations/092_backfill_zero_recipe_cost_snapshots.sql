-- Las fotos de costo guardadas mientras el producto no tenía stock quedaron en 0
-- (products_with_stock devolvía min_cost/max_cost nulos, ver 091). Se reescriben
-- solo esas filas con el costo del último lote recibido en o antes de la fecha de
-- la transacción. Las fotos con costo real no se tocan. Idempotente.
DO $$
DECLARE
  v_admin uuid;
  v_rows  int;
BEGIN
  SELECT id INTO v_admin FROM profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'No hay usuario admin en profiles — no se puede registrar la auditoría.';
  END IF;

  UPDATE transaction_recipe_costs c
  SET avg_unit_cost = fix.new_cost
  FROM (
    SELECT
      c2.id,
      COALESCE(
        (SELECT il.unit_cost FROM inventory_lots il
          WHERE il.product_id = c2.product_id AND il.received_date <= t.date
          ORDER BY il.received_date DESC, il.created_at DESC LIMIT 1),
        (SELECT il.unit_cost FROM inventory_lots il
          WHERE il.product_id = c2.product_id
          ORDER BY il.received_date DESC, il.created_at DESC LIMIT 1)
      ) AS new_cost
    FROM transaction_recipe_costs c2
    JOIN transactions t ON t.id = c2.transaction_id
    WHERE c2.avg_unit_cost = 0
  ) fix
  WHERE c.id = fix.id
    AND fix.new_cost IS NOT NULL
    AND fix.new_cost > 0;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  INSERT INTO user_action_logs (user_id, action, entity, entity_id, metadata)
  VALUES (
    v_admin,
    'backfill_recipe_cost_snapshots',
    'transaction_recipe_costs',
    NULL,
    jsonb_build_object(
      'filas_corregidas', v_rows,
      'motivo', 'Reemplazar fotos de costo en 0 por el último costo de lote a la fecha de la transacción'
    )
  );
END $$;
