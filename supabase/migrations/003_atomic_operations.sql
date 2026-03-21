-- ============================================================
-- Migration 003 — Atomic sale and receive-PO operations
--
-- Wraps the previously non-atomic multi-step flows into single
-- SECURITY DEFINER functions so that a partial failure rolls back
-- the entire operation instead of leaving orphaned rows.
-- ============================================================

-- ------------------------------------------------------------
-- create_sale
--
-- Inserts a transaction and calls consume_inventory_fifo for
-- each item in a single implicit DB transaction.
-- Returns the new transaction UUID.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_sale(
  p_date          DATE,
  p_category_id   UUID,
  p_description   TEXT,
  p_created_by    UUID,
  p_items         JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item        JSONB;
  total       NUMERIC := 0;
  tx_id       UUID;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    total := total + (item->>'quantity')::NUMERIC * (item->>'unit_sale_price')::NUMERIC;
  END LOOP;

  INSERT INTO transactions (date, type, amount, category_id, description, created_by)
  VALUES (p_date, 'income', total, p_category_id, p_description, p_created_by)
  RETURNING id INTO tx_id;

  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    PERFORM consume_inventory_fifo(
      (item->>'product_id')::UUID,
      (item->>'quantity')::NUMERIC,
      tx_id,
      (item->>'unit_sale_price')::NUMERIC,
      p_created_by
    );
  END LOOP;

  RETURN tx_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_sale(DATE, UUID, TEXT, UUID, JSONB) TO authenticated;


-- ------------------------------------------------------------
-- receive_purchase_order
--
-- For each item in the PO: creates an inventory lot, links it
-- back to the PO item, and records an inbound movement.
-- Finally marks the PO as received.
-- Raises if the PO is not in 'draft' status.
-- ------------------------------------------------------------
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
  lot_id         UUID;
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
