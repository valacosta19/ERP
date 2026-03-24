ALTER TABLE products ADD COLUMN IF NOT EXISTS skip_restock boolean NOT NULL DEFAULT false;
