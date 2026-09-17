-- Repair the two transfers created while the frontend and database RPC were
-- temporarily out of sync. Abort atomically unless each malformed shape is
-- uniquely identifiable.
DO $repair_malformed_internal_transfers$
DECLARE
  v_expected record;
  v_transaction_id uuid;
  v_match_count integer;
  v_updated_count integer;
BEGIN
  FOR v_expected IN
    SELECT *
    FROM (VALUES
      ('USD'::text, 160::numeric, 80::numeric),
      ('ARS'::text, 160000::numeric, 80000::numeric)
    ) AS expected(currency, malformed_amount, actual_amount)
  LOOP
    WITH candidates AS (
      SELECT t.id
      FROM transactions t
      JOIN transaction_categories tc ON tc.id = t.subcategory_id
      WHERE t.date = DATE '2026-09-16'
        AND t.currency = v_expected.currency
        AND t.amount = v_expected.malformed_amount
        AND t.voided_at IS NULL
        AND lower(regexp_replace(btrim(tc.name), '[[:space:]]+', ' ', 'g')) = 'transferencia interna'
        AND (
          SELECT count(*)
          FROM transaction_payments tp
          WHERE tp.transaction_id = t.id
        ) = 2
        AND (
          SELECT count(*)
          FROM transaction_payments tp
          WHERE tp.transaction_id = t.id
            AND lower(btrim(tp.payment_method)) = lower('Efectivo')
            AND tp.amount = v_expected.actual_amount
            AND tp.type = 'entrada'
        ) = 1
        AND (
          SELECT count(*)
          FROM transaction_payments tp
          WHERE tp.transaction_id = t.id
            AND lower(btrim(tp.payment_method)) = lower('Efectivo Valentina')
            AND tp.amount = v_expected.actual_amount
            AND tp.type = 'entrada'
        ) = 1
    )
    SELECT count(*), (array_agg(id))[1]
    INTO v_match_count, v_transaction_id
    FROM candidates;

    IF v_match_count <> 1 THEN
      RAISE EXCEPTION
        'Expected exactly one malformed % internal transfer, found %.',
        v_expected.currency,
        v_match_count;
    END IF;

    UPDATE transactions
    SET amount = v_expected.actual_amount
    WHERE id = v_transaction_id;

    UPDATE transaction_payments
    SET type = CASE
      WHEN lower(btrim(payment_method)) = lower('Efectivo') THEN 'salida'
      WHEN lower(btrim(payment_method)) = lower('Efectivo Valentina') THEN 'entrada'
      ELSE type
    END
    WHERE transaction_id = v_transaction_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> 2 THEN
      RAISE EXCEPTION
        'Expected to repair two payment legs for transaction %, updated %.',
        v_transaction_id,
        v_updated_count;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM transactions t
      WHERE t.id = v_transaction_id
        AND t.amount = v_expected.actual_amount
        AND (
          SELECT count(*)
          FROM transaction_payments tp
          WHERE tp.transaction_id = t.id
            AND lower(btrim(tp.payment_method)) = lower('Efectivo')
            AND tp.amount = v_expected.actual_amount
            AND tp.type = 'salida'
        ) = 1
        AND (
          SELECT count(*)
          FROM transaction_payments tp
          WHERE tp.transaction_id = t.id
            AND lower(btrim(tp.payment_method)) = lower('Efectivo Valentina')
            AND tp.amount = v_expected.actual_amount
            AND tp.type = 'entrada'
        ) = 1
    ) THEN
      RAISE EXCEPTION 'Transfer repair verification failed for transaction %.', v_transaction_id;
    END IF;
  END LOOP;
END
$repair_malformed_internal_transfers$;
