-- Void transactions and reverse any linked receivable collections atomically.
-- The transaction itself remains as the immutable audit record.

CREATE OR REPLACE FUNCTION reverse_transaction_receivable_collections(
  p_transaction_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receivable_ids uuid[] := ARRAY[]::uuid[];
  v_collection_count integer := 0;
  v_reversed_amount numeric := 0;
  v_collections jsonb := '[]'::jsonb;
BEGIN
  -- Serialize collection removal before locking the parent receivables in a
  -- stable order. Re-running this function is a no-op after the first delete.
  PERFORM rc.id
  FROM receivable_collections rc
  WHERE rc.transaction_id = p_transaction_id
  ORDER BY rc.id
  FOR UPDATE;

  SELECT COALESCE(array_agg(DISTINCT rc.receivable_id ORDER BY rc.receivable_id), ARRAY[]::uuid[])
  INTO v_receivable_ids
  FROM receivable_collections rc
  WHERE rc.transaction_id = p_transaction_id;

  IF cardinality(v_receivable_ids) > 0 THEN
    PERFORM r.id
    FROM receivables r
    WHERE r.id = ANY(v_receivable_ids)
    ORDER BY r.id
    FOR UPDATE;

    WITH deleted AS (
      DELETE FROM receivable_collections rc
      WHERE rc.transaction_id = p_transaction_id
      RETURNING rc.id, rc.receivable_id, rc.amount
    )
    SELECT
      count(*)::integer,
      COALESCE(sum(amount), 0),
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'collection_id', id,
            'receivable_id', receivable_id,
            'amount', amount
          ) ORDER BY id
        ),
        '[]'::jsonb
      )
    INTO v_collection_count, v_reversed_amount, v_collections
    FROM deleted;

    -- The ledger is authoritative. Recalculate instead of decrementing so a
    -- retry cannot return the money twice and existing drift is corrected.
    UPDATE receivables r
    SET collected_amount = (
      SELECT COALESCE(sum(rc.amount), 0)
      FROM receivable_collections rc
      WHERE rc.receivable_id = r.id
    )
    WHERE r.id = ANY(v_receivable_ids);
  END IF;

  RETURN jsonb_build_object(
    'collection_count', v_collection_count,
    'reversed_amount', v_reversed_amount,
    'receivable_ids', to_jsonb(v_receivable_ids),
    'collections', v_collections
  );
END;
$$;

CREATE OR REPLACE FUNCTION assert_transaction_is_not_commission_payout(
  p_transaction_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM commission_payouts cp
    WHERE cp.paid_via_transaction_id = p_transaction_id
  ) THEN
    RAISE EXCEPTION 'No se puede anular una transacción vinculada a una liquidación de comisiones. La liquidación requiere su propio flujo de reversión.';
  END IF;
END;
$$;

-- Defense in depth for legacy/direct UPDATE callers: the same invariant is
-- enforced even when a transaction is voided outside the browser RPC.
CREATE OR REPLACE FUNCTION reverse_receivables_before_transaction_void()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL THEN
    -- A commission payout owns additional accounting state. Reopening only
    -- its receivables would corrupt the settled payout, so fail before writes.
    PERFORM assert_transaction_is_not_commission_payout(OLD.id);
    PERFORM reverse_transaction_receivable_collections(OLD.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reverse_receivables_before_transaction_void ON transactions;
CREATE TRIGGER trg_reverse_receivables_before_transaction_void
BEFORE UPDATE OF voided_at ON transactions
FOR EACH ROW
EXECUTE FUNCTION reverse_receivables_before_transaction_void();

-- Do not allow a late/retried collection write to recreate the inconsistency
-- after the transaction has already been voided.
CREATE OR REPLACE FUNCTION reject_collection_for_voided_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_voided_at timestamptz;
BEGIN
  IF NEW.transaction_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT t.voided_at
  INTO v_voided_at
  FROM transactions t
  WHERE t.id = NEW.transaction_id
  FOR UPDATE;

  IF FOUND AND v_voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede vincular una cobranza a una transacción anulada.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_collection_for_voided_transaction ON receivable_collections;
CREATE TRIGGER trg_reject_collection_for_voided_transaction
BEFORE INSERT OR UPDATE OF transaction_id ON receivable_collections
FOR EACH ROW
EXECUTE FUNCTION reject_collection_for_voided_transaction();

CREATE OR REPLACE FUNCTION void_transaction(p_transaction_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_voided_at timestamptz;
  v_reversal jsonb;
  v_already_voided boolean;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so reproduce the policy from migration 030:
  -- any authenticated user may void a transaction, while anon is rejected.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para anular transacciones.';
  END IF;

  SELECT voided_at
  INTO v_existing_voided_at
  FROM transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La transacción indicada no existe.';
  END IF;

  v_already_voided := v_existing_voided_at IS NOT NULL;

  -- Completed retries are no-ops. A historical void that still has linked
  -- collections would perform a repair, so it must pass the commission guard.
  IF NOT v_already_voided OR EXISTS (
    SELECT 1
    FROM receivable_collections rc
    WHERE rc.transaction_id = p_transaction_id
  ) THEN
    PERFORM assert_transaction_is_not_commission_payout(p_transaction_id);
  END IF;

  v_reversal := reverse_transaction_receivable_collections(p_transaction_id);

  IF NOT v_already_voided THEN
    UPDATE transactions
    SET voided_at = now(), voided_by = auth.uid()
    WHERE id = p_transaction_id;
  END IF;

  -- Log only state changes. A completed retry is a safe no-op and does not
  -- generate duplicate audit entries.
  IF NOT v_already_voided OR (v_reversal->>'collection_count')::integer > 0 THEN
    INSERT INTO user_action_logs (user_id, action, entity, entity_id, metadata)
    VALUES (
      auth.uid(),
      'void_transaction',
      'transactions',
      p_transaction_id,
      jsonb_build_object(
        'already_voided', v_already_voided,
        'receivable_reversal', v_reversal
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'transaction_id', p_transaction_id,
    'already_voided', v_already_voided,
    'receivable_reversal', v_reversal
  );
END;
$$;

REVOKE ALL ON FUNCTION reverse_transaction_receivable_collections(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION assert_transaction_is_not_commission_payout(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reverse_receivables_before_transaction_void() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reject_collection_for_voided_transaction() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION void_transaction(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION void_transaction(uuid) TO authenticated;
