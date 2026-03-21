-- ============================================================
-- Migration 004 — Phase 8: Transactions v2
--
-- Adds hairdressers, transaction_payments, transaction_hairdressers
-- and extends transactions with seña fields.
-- ============================================================

-- ------------------------------------------------------------
-- hairdressers
-- ------------------------------------------------------------
CREATE TABLE hairdressers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT UNIQUE NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE hairdressers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read hairdressers"
  ON hairdressers FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin insert hairdressers"
  ON hairdressers FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "admin update hairdressers"
  ON hairdressers FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "admin delete hairdressers"
  ON hairdressers FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ------------------------------------------------------------
-- transaction_payments
-- ------------------------------------------------------------
CREATE TABLE transaction_payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL,
  instrument     TEXT,
  amount         NUMERIC NOT NULL,
  type           TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE transaction_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read transaction_payments"
  ON transaction_payments FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated insert transaction_payments"
  ON transaction_payments FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "admin delete transaction_payments"
  ON transaction_payments FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ------------------------------------------------------------
-- transaction_hairdressers
-- ------------------------------------------------------------
CREATE TABLE transaction_hairdressers (
  transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  hairdresser_id  UUID NOT NULL REFERENCES hairdressers(id) ON DELETE CASCADE,
  PRIMARY KEY (transaction_id, hairdresser_id)
);

ALTER TABLE transaction_hairdressers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read transaction_hairdressers"
  ON transaction_hairdressers FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated insert transaction_hairdressers"
  ON transaction_hairdressers FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "admin delete transaction_hairdressers"
  ON transaction_hairdressers FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ------------------------------------------------------------
-- Extend transactions table
-- ------------------------------------------------------------
ALTER TABLE transactions
  ADD COLUMN is_seña     BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN seña_amount NUMERIC;
