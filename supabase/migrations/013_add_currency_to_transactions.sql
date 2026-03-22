ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'ARS'
    CHECK (currency IN ('ARS', 'USD', 'EUR'));
