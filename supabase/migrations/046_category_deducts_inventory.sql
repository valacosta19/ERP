ALTER TABLE transaction_categories
ADD COLUMN deducts_inventory boolean NOT NULL DEFAULT false;
