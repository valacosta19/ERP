ALTER TABLE transactions ADD COLUMN catalog_item_id uuid REFERENCES catalog_items(id);

UPDATE transactions t
SET catalog_item_id = ci.id
FROM catalog_items ci
WHERE t.catalog_item_id IS NULL
  AND lower(trim(t.description)) = lower(trim(ci.name));

CREATE INDEX idx_transactions_catalog_item ON transactions(catalog_item_id);
