-- Preview what will change before running the UPDATE
-- SELECT id, date AS stored, description,
--   make_date(
--     EXTRACT(YEAR FROM date)::int,
--     EXTRACT(DAY FROM date)::int,
--     EXTRACT(MONTH FROM date)::int
--   ) AS corrected
-- FROM transactions
-- WHERE EXTRACT(DAY FROM date) <= 12
-- ORDER BY date;

-- Fix: swap month and day for all rows where the Excel sent DD/MM/YYYY
-- and Postgres (MDY datestyle) read it as MM/DD/YYYY.
-- Only applies where the stored "day" value is ≤ 12 (i.e., was a valid month).
UPDATE transactions
SET date = make_date(
  EXTRACT(YEAR FROM date)::int,
  EXTRACT(DAY FROM date)::int,
  EXTRACT(MONTH FROM date)::int
)
WHERE EXTRACT(DAY FROM date) <= 12;
