ALTER TABLE transactions
  ADD COLUMN product_id UUID REFERENCES products(id);

CREATE INDEX idx_transactions_product_id ON transactions(product_id);
