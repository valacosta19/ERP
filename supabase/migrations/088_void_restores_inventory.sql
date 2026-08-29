-- ============================================================
-- Anular una transacción repone el inventario que consumió.
--
-- void_transaction (migración 075) marca voided_at y revierte las cobranzas
-- vinculadas, pero no toca el stock. Una venta de producto (create_funnel_unit)
-- o un gasto de "Consumos y cortesías" pasan por consume_inventory_fifo, que
-- descuenta remaining_quantity de los lotes y deja sale_items (lote, cantidad,
-- costo) e inventory_movements 'out'. Al anular, los lotes quedaban
-- descontados y el stock en /inventory era menor que el real.
--
-- Se redefine void_transaction para que, en la misma transacción SQL:
--   1. Devuelva la cantidad a los lotes exactos registrados en sale_items
--      (remaining_quantity += quantity por lote). No se recalcula FIFO ni se
--      elige otro lote: vuelve la misma cantidad al mismo lote de donde salió.
--   2. Inserte un inventory_movements 'adjustment' positivo por lote, con el
--      unit_cost de la venta, reference_type = 'transaction_void',
--      reference_id = la transacción anulada, reason 'Anulación de venta' y
--      created_by = auth.uid(). Todo cambio en remaining_quantity tiene su
--      movimiento; movement_type ya admite 'adjustment' (migración 001).
--   3. Sea idempotente: si la transacción ya estaba anulada no repone de
--      nuevo. sale_items queda intacto (es inmutable) y sirve de auditoría.
--
-- Se conservan la validación de sesión, el guard de liquidaciones de comisión,
-- la reversión de cobranzas, el log en user_action_logs (ahora con el detalle
-- de lotes repuestos) y el chequeo de período cerrado, que sigue aplicando el
-- trigger de locked_periods (migración 033) sobre el UPDATE de transactions.
-- ============================================================

CREATE OR REPLACE FUNCTION restore_transaction_inventory(
  p_transaction_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restored jsonb := '[]'::jsonb;
  v_lot_count integer := 0;
BEGIN
  PERFORM l.id
  FROM inventory_lots l
  WHERE l.id IN (
    SELECT si.lot_id FROM sale_items si WHERE si.transaction_id = p_transaction_id
  )
  ORDER BY l.id
  FOR UPDATE;

  WITH restored AS (
    UPDATE inventory_lots l
    SET remaining_quantity = l.remaining_quantity + si.total_quantity
    FROM (
      SELECT lot_id, product_id, sum(quantity) AS total_quantity
      FROM sale_items
      WHERE transaction_id = p_transaction_id
      GROUP BY lot_id, product_id
    ) si
    WHERE l.id = si.lot_id
    RETURNING l.id AS lot_id, si.total_quantity
  )
  SELECT count(*)::integer,
         COALESCE(jsonb_agg(jsonb_build_object('lot_id', lot_id, 'quantity', total_quantity) ORDER BY lot_id), '[]'::jsonb)
  INTO v_lot_count, v_restored
  FROM restored;

  INSERT INTO inventory_movements (
    lot_id, product_id, movement_type, quantity, unit_cost,
    reference_type, reference_id, created_by, reason
  )
  SELECT
    si.lot_id, si.product_id, 'adjustment', si.quantity, si.unit_cost,
    'transaction_void', p_transaction_id, auth.uid(), 'Anulación de venta'
  FROM sale_items si
  WHERE si.transaction_id = p_transaction_id
  ORDER BY si.created_at, si.id;

  RETURN jsonb_build_object(
    'lot_count', v_lot_count,
    'lots', v_restored
  );
END;
$$;

CREATE OR REPLACE FUNCTION void_transaction(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_voided_at timestamptz;
  v_reversal jsonb;
  v_inventory jsonb := jsonb_build_object('lot_count', 0, 'lots', '[]'::jsonb);
  v_already_voided boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para anular transacciones.';
  END IF;

  SELECT voided_at
  INTO v_existing_voided_at
  FROM transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La transacción indicada no existe.';
  END IF;

  v_already_voided := v_existing_voided_at IS NOT NULL;

  IF NOT v_already_voided OR EXISTS (
    SELECT 1
    FROM receivable_collections rc
    WHERE rc.transaction_id = p_transaction_id
  ) THEN
    PERFORM assert_transaction_is_not_commission_payout(p_transaction_id);
  END IF;

  v_reversal := reverse_transaction_receivable_collections(p_transaction_id);

  IF NOT v_already_voided THEN
    UPDATE transactions
    SET voided_at = now(), voided_by = auth.uid()
    WHERE id = p_transaction_id;

    v_inventory := restore_transaction_inventory(p_transaction_id);
  END IF;

  IF NOT v_already_voided OR (v_reversal->>'collection_count')::integer > 0 THEN
    INSERT INTO user_action_logs (user_id, action, entity, entity_id, metadata)
    VALUES (
      auth.uid(),
      'void_transaction',
      'transactions',
      p_transaction_id,
      jsonb_build_object(
        'already_voided', v_already_voided,
        'receivable_reversal', v_reversal,
        'inventory_restore', v_inventory
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'transaction_id', p_transaction_id,
    'already_voided', v_already_voided,
    'receivable_reversal', v_reversal,
    'inventory_restore', v_inventory
  );
END;
$$;

REVOKE ALL ON FUNCTION restore_transaction_inventory(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION void_transaction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION void_transaction(uuid) TO authenticated;
