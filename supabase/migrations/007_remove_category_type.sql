-- Remove type column from categories: categories are now plain labels, not tied to income/expense
ALTER TABLE categories DROP CONSTRAINT IF EXISTS categories_name_type_key;
ALTER TABLE categories DROP COLUMN IF EXISTS type;
ALTER TABLE categories ADD CONSTRAINT categories_name_key UNIQUE (name);
