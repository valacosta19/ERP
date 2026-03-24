ALTER TABLE purchase_orders
  ADD COLUMN shipping_cost numeric(12, 2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION receive_purchase_order(
  p_po_id       UUID,
  p_created_by  UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status     TEXT;
  v_shipping_cost    NUMERIC;
  v_total_items_cost NUMERIC;
  item               RECORD;
  lot_id             UUID;
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

  SELECT COALESCE(SUM(quantity * unit_cost), 0)
  INTO v_total_items_cost
  FROM purchase_order_items
  WHERE purchase_order_id = p_po_id;

  FOR item IN
    SELECT id, product_id, quantity, unit_cost
    FROM purchase_order_items
    WHERE purchase_order_id = p_po_id
  LOOP
    IF v_shipping_cost > 0 AND v_total_items_cost > 0 THEN
      effective_unit_cost := item.unit_cost + (v_shipping_cost * item.unit_cost / v_total_items_cost);
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
      item.quantity,
      item.quantity,
      effective_unit_cost
    )
    RETURNING id INTO lot_id;

    UPDATE purchase_order_items
    SET lot_id = lot_id
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
      lot_id,
      item.product_id,
      'in',
      item.quantity,
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

GRANT EXECUTE ON FUNCTION receive_purchase_order(UUID, UUID) TO authenticated;
