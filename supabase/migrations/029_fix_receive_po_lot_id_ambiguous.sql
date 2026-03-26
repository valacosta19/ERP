-- Fix ambiguous column reference: rename local variable lot_id -> v_lot_id
-- to avoid conflict with purchase_order_items.lot_id column.

CREATE OR REPLACE FUNCTION receive_purchase_order(
  p_po_id       UUID,
  p_created_by  UUID,
  p_items       JSONB DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status      TEXT;
  v_shipping_cost     NUMERIC;
  v_total_items_cost  NUMERIC := 0;
  item                RECORD;
  v_received_qty      NUMERIC;
  v_lot_id            UUID;
  effective_unit_cost NUMERIC;
BEGIN
  SELECT status, shipping_cost
  INTO current_status, v_shipping_cost
  FROM purchase_orders
  WHERE id = p_po_id;

  IF current_status IS NULL THEN
    RAISE EXCEPTION 'Purchase order % not found.', p_po_id;
  END IF;

  IF current_status <> 'draft' THEN
    RAISE EXCEPTION 'Purchase order % is already % and cannot be received.', p_po_id, current_status;
  END IF;

  -- Compute total cost of actually-received items for proportional shipping
  FOR item IN
    SELECT poi.id, poi.unit_cost,
           CASE
             WHEN p_items IS NULL THEN poi.quantity
             ELSE COALESCE((SELECT (el->>'quantity')::NUMERIC
                            FROM jsonb_array_elements(p_items) el
                            WHERE (el->>'id')::UUID = poi.id), 0)
           END AS recv_qty
    FROM purchase_order_items poi
    WHERE poi.purchase_order_id = p_po_id
  LOOP
    IF item.recv_qty > 0 THEN
      v_total_items_cost := v_total_items_cost + item.recv_qty * item.unit_cost;
    END IF;
  END LOOP;

  FOR item IN
    SELECT poi.id, poi.product_id, poi.unit_cost,
           CASE
             WHEN p_items IS NULL THEN poi.quantity
             ELSE COALESCE((SELECT (el->>'quantity')::NUMERIC
                            FROM jsonb_array_elements(p_items) el
                            WHERE (el->>'id')::UUID = poi.id), 0)
           END AS recv_qty
    FROM purchase_order_items poi
    WHERE poi.purchase_order_id = p_po_id
  LOOP
    v_received_qty := item.recv_qty;
    CONTINUE WHEN v_received_qty <= 0;

    IF v_shipping_cost > 0 AND v_total_items_cost > 0 THEN
      effective_unit_cost := item.unit_cost + (v_shipping_cost * (v_received_qty * item.unit_cost) / v_total_items_cost) / v_received_qty;
    ELSE
      effective_unit_cost := item.unit_cost;
    END IF;

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
      v_received_qty,
      v_received_qty,
      effective_unit_cost
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
      v_received_qty,
      effective_unit_cost,
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

GRANT EXECUTE ON FUNCTION receive_purchase_order(UUID, UUID, JSONB) TO authenticated;
