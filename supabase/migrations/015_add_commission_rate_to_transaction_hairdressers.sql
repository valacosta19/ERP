ALTER TABLE transaction_hairdressers
  ADD COLUMN IF NOT EXISTS commission_rate numeric NOT NULL DEFAULT 0;
