-- Flag de transacciones de producto/consumo cuyo inventario no se descontó (sin stock al registrar).
-- Permite registrarlas igual y resolverlas luego (editar y re-guardar corre el FIFO y limpia el flag).

ALTER TABLE transactions
  ADD COLUMN inventory_pending boolean NOT NULL DEFAULT false;

-- Backfill: marcar como pendientes las ventas/consumos históricos sin movimiento de inventario.
UPDATE transactions t
SET inventory_pending = true
FROM transaction_categories c
WHERE c.id = t.subcategory_id
  AND t.voided_at IS NULL
  AND (c.name = 'Producto' OR c.deducts_inventory = true)
  AND NOT EXISTS (
    SELECT 1 FROM inventory_movements im
    WHERE im.reference_id = t.id AND im.reference_type = 'transaction'
  );
