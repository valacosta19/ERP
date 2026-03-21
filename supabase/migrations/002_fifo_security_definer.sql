-- Make consume_inventory_fifo SECURITY DEFINER so employees can call it
-- without needing direct UPDATE on inventory_lots or INSERT on sale_items/inventory_movements

CREATE OR REPLACE FUNCTION consume_inventory_fifo(
  p_product_id      UUID,
  p_quantity        NUMERIC,
  p_transaction_id  UUID,
  p_unit_sale_price NUMERIC,
  p_created_by      UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lot           RECORD;
  qty_needed    NUMERIC := p_quantity;
  qty_to_take   NUMERIC;
BEGIN
  FOR lot IN
    SELECT id, remaining_quantity, unit_cost
    FROM inventory_lots
    WHERE product_id = p_product_id AND remaining_quantity > 0
    ORDER BY received_date ASC
    FOR UPDATE
  LOOP
    EXIT WHEN qty_needed <= 0;

    qty_to_take := LEAST(lot.remaining_quantity, qty_needed);

    UPDATE inventory_lots
    SET remaining_quantity = remaining_quantity - qty_to_take
    WHERE id = lot.id;

    INSERT INTO sale_items (transaction_id, product_id, lot_id, quantity, unit_cost, unit_sale_price)
    VALUES (p_transaction_id, p_product_id, lot.id, qty_to_take, lot.unit_cost, p_unit_sale_price);

    INSERT INTO inventory_movements (lot_id, product_id, movement_type, quantity, unit_cost, reference_type, reference_id, created_by)
    VALUES (lot.id, p_product_id, 'out', qty_to_take, lot.unit_cost, 'transaction', p_transaction_id, p_created_by);

    qty_needed := qty_needed - qty_to_take;
  END LOOP;

  IF qty_needed > 0 THEN
    RAISE EXCEPTION 'Stock insuficiente para el producto %. Faltan % unidades.', p_product_id, qty_needed;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION consume_inventory_fifo(UUID, NUMERIC, UUID, NUMERIC, UUID) TO authenticated;
