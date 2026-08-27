CREATE TABLE period_balance_snapshots (
  year            int    NOT NULL,
  month           int    NOT NULL CHECK (month BETWEEN 1 AND 12),
  payment_method  text   NOT NULL,
  currency        text   NOT NULL,
  closing_balance numeric NOT NULL DEFAULT 0,
  computed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (year, month, payment_method, currency)
);

ALTER TABLE period_balance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read period_balance_snapshots"
  ON period_balance_snapshots FOR SELECT
  TO authenticated USING (true);

-- Computes (or recomputes) closing balances for a given period.
-- Cumulative sum of all non-voided transaction_payments up to the last day of the month.
CREATE OR REPLACE FUNCTION compute_period_snapshots(p_year int, p_month int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'Solo un administrador puede calcular cierres de período.'; END IF;

  DELETE FROM period_balance_snapshots
  WHERE year = p_year AND month = p_month;

  INSERT INTO period_balance_snapshots (year, month, payment_method, currency, closing_balance)
  SELECT
    p_year,
    p_month,
    tp.payment_method,
    t.currency,
    SUM(CASE WHEN tp.type = 'entrada' THEN tp.amount ELSE -tp.amount END)
  FROM transaction_payments tp
  JOIN transactions t ON t.id = tp.transaction_id
  WHERE t.voided_at IS NULL
    AND t.date <= (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')::date
  GROUP BY tp.payment_method, t.currency;
END;
$$;

REVOKE ALL ON FUNCTION compute_period_snapshots(int, int) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION lock_period_with_snapshot(p_year int, p_month int)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'Solo un administrador puede cerrar períodos.'; END IF;
  IF p_year < 2000 OR p_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'El período indicado no es válido.';
  END IF;
  INSERT INTO locked_periods (year, month, locked_by)
  VALUES (p_year, p_month, auth.uid());
  PERFORM compute_period_snapshots(p_year, p_month);
END;
$$;

REVOKE ALL ON FUNCTION lock_period_with_snapshot(int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION lock_period_with_snapshot(int, int) TO authenticated;

-- Returns the cumulative balance immediately before p_before_date.
-- Uses the most recent available snapshot as a base, then adds the delta
-- from the day after that snapshot to p_before_date - 1 day.
-- Falls back to a full sum if no snapshot exists yet.
CREATE OR REPLACE FUNCTION get_opening_balance(
  p_before_date    date,
  p_payment_method text DEFAULT NULL,
  p_currency       text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_snap_year        int;
  v_snap_month       int;
  v_snap_balance     numeric;
  v_snap_end_date    date;
  v_delta            numeric;
BEGIN
  -- Find the most recent period that has a snapshot before p_before_date
  SELECT year, month
  INTO v_snap_year, v_snap_month
  FROM period_balance_snapshots
  WHERE (year * 12 + month) < (EXTRACT(YEAR FROM p_before_date)::int * 12 + EXTRACT(MONTH FROM p_before_date)::int)
    AND (p_payment_method IS NULL OR payment_method = p_payment_method)
    AND (p_currency IS NULL OR currency = p_currency)
  ORDER BY year DESC, month DESC
  LIMIT 1;

  IF v_snap_year IS NULL THEN
    v_snap_balance   := 0;
    v_snap_end_date  := '1900-01-01'::date;
  ELSE
    SELECT COALESCE(SUM(closing_balance), 0)
    INTO v_snap_balance
    FROM period_balance_snapshots
    WHERE year = v_snap_year AND month = v_snap_month
      AND (p_payment_method IS NULL OR payment_method = p_payment_method)
      AND (p_currency IS NULL OR currency = p_currency);

    v_snap_end_date := (make_date(v_snap_year, v_snap_month, 1) + interval '1 month' - interval '1 day')::date;
  END IF;

  -- Delta: transactions strictly after the snapshot end and strictly before p_before_date
  SELECT COALESCE(SUM(CASE WHEN tp.type = 'entrada' THEN tp.amount ELSE -tp.amount END), 0)
  INTO v_delta
  FROM transaction_payments tp
  JOIN transactions t ON t.id = tp.transaction_id
  WHERE t.voided_at IS NULL
    AND t.date > v_snap_end_date
    AND t.date < p_before_date
    AND (p_payment_method IS NULL OR tp.payment_method = p_payment_method)
    AND (p_currency IS NULL OR t.currency = p_currency);

  RETURN v_snap_balance + v_delta;
END;
$$;
