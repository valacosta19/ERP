INSERT INTO transaction_categories (name, parent_id)
SELECT 'Préstamos otorgados', id
FROM transaction_categories
WHERE name = 'Movimientos' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

ALTER TABLE receivables ADD COLUMN IF NOT EXISTS source_transaction_id uuid REFERENCES transactions(id) ON DELETE SET NULL;
