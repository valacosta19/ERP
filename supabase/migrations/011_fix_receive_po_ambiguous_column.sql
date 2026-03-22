-- Fix ambiguous column reference in receive_purchase_order
-- PostgreSQL error 42702: "lot_id = lot_id" is ambiguous (variable vs column)
-- Renamed local variable from lot_id to v_lot_id

CREATE OR REPLACE FUNCTION receive_purchase_order(
  p_po_id       UUID,
  p_created_by  UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status TEXT;
  item           RECORD;
  v_lot_id       UUID;
BEGIN
  SELECT status INTO current_status
  FROM purchase_orders
  WHERE id = p_po_id;

  IF current_status IS NULL THEN
    RAISE EXCEPTION 'Purchase order % not found.', p_po_id;
  END IF;

  IF current_status <> 'draft' THEN
    RAISE EXCEPTION 'Purchase order % is already % and cannot be received.', p_po_id, current_status;
  END IF;

  FOR item IN
    SELECT id, product_id, quantity, unit_cost
    FROM purchase_order_items
    WHERE purchase_order_id = p_po_id
  LOOP
    INSERT INTO inventory_lots (
      product_id,
      purchase_order_item_id,
      received_date,
      initial_quantity,
      remaining_quantity,
      unit_cost
    ) VALUES (
      item.product_id,
      item.id,
      CURRENT_DATE,
      item.quantity,
      item.quantity,
      item.unit_cost
    )
    RETURNING id INTO v_lot_id;

    UPDATE purchase_order_items
    SET lot_id = v_lot_id
    WHERE id = item.id;

    INSERT INTO inventory_movements (
      lot_id,
      product_id,
      movement_type,
      quantity,
      unit_cost,
      reference_type,
      reference_id,
      created_by
    ) VALUES (
      v_lot_id,
      item.product_id,
      'in',
      item.quantity,
      item.unit_cost,
      'purchase_order',
      p_po_id,
      p_created_by
    );
  END LOOP;

  UPDATE purchase_orders
  SET status = 'received'
  WHERE id = p_po_id;
END;
$$;

GRANT EXECUTE ON FUNCTION receive_purchase_order(UUID, UUID) TO authenticated;
