ALTER TABLE transactions
  ADD COLUMN refunds_anticipo_id uuid REFERENCES transactions(id);
