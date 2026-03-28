CREATE TABLE locked_periods (
  year  int  NOT NULL,
  month int  NOT NULL CHECK (month BETWEEN 1 AND 12),
  locked_at  timestamptz NOT NULL DEFAULT now(),
  locked_by  uuid REFERENCES auth.users(id),
  PRIMARY KEY (year, month)
);

ALTER TABLE locked_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins can manage locked_periods"
  ON locked_periods
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION check_transaction_period_not_locked()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  tx_year  int;
  tx_month int;
BEGIN
  tx_year  := EXTRACT(YEAR  FROM NEW.date::date)::int;
  tx_month := EXTRACT(MONTH FROM NEW.date::date)::int;

  IF EXISTS (
    SELECT 1 FROM locked_periods
    WHERE year = tx_year AND month = tx_month
  ) THEN
    RAISE EXCEPTION 'El período %/% está cerrado y no puede modificarse.', tx_month, tx_year;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_locked_period_insert
  BEFORE INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION check_transaction_period_not_locked();

CREATE TRIGGER trg_check_locked_period_update
  BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION check_transaction_period_not_locked();
