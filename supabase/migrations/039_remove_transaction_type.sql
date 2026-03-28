ALTER TABLE transaction_categories
  ADD COLUMN transaction_type text CHECK (transaction_type IN ('income', 'expense', 'transfer'));

UPDATE transaction_categories SET transaction_type = 'income'   WHERE name = 'Ingresos'    AND parent_id IS NULL;
UPDATE transaction_categories SET transaction_type = 'expense'  WHERE name = 'Costos'      AND parent_id IS NULL;
UPDATE transaction_categories SET transaction_type = 'expense'  WHERE name = 'Gastos'      AND parent_id IS NULL;
UPDATE transaction_categories SET transaction_type = 'transfer' WHERE name = 'Movimientos' AND parent_id IS NULL;

UPDATE transaction_categories sub
SET transaction_type = parent.transaction_type
FROM transaction_categories parent
WHERE sub.parent_id = parent.id;

CREATE OR REPLACE FUNCTION inherit_transaction_type()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND NEW.transaction_type IS NULL THEN
    SELECT transaction_type INTO NEW.transaction_type
    FROM transaction_categories WHERE id = NEW.parent_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_transaction_type
  BEFORE INSERT ON transaction_categories
  FOR EACH ROW EXECUTE FUNCTION inherit_transaction_type();

ALTER TABLE transactions DROP COLUMN type;
