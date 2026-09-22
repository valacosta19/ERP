-- Mercado Pago imports are proposals, not accounting entries. Keep every new
-- movement pending until an administrator explicitly publishes it.

CREATE OR REPLACE FUNCTION post_mp_movement(
  p_movement_id uuid,
  p_actor_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  -- Compatibility no-op for an older deployed Edge Function. The sync no
  -- longer calls this RPC, but leaving it harmless prevents a deployment race
  -- from creating another accounting transaction.
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION post_mp_movement(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION post_mp_movement(uuid, uuid) TO service_role;

-- Start with every row carrying the exact marker written by the former RPC.
-- A second table below admits a candidate only when every generated invariant
-- still matches. Any mismatch aborts the whole migration for manual review.
CREATE TEMP TABLE mp_automatic_posting_candidates ON COMMIT DROP AS
SELECT
  link.id AS link_id,
  link.movement_id,
  link.transaction_id,
  link.classification,
  link.reconciled_at,
  link.reconciled_by,
  link.notes,
  transaction_row.voided_at AS previous_voided_at
FROM mp_reconciliation_links link
JOIN transactions transaction_row
  ON transaction_row.id = link.transaction_id
WHERE link.notes = 'Publicación automática desde reporte de Mercado Pago';

CREATE UNIQUE INDEX ON mp_automatic_posting_candidates(link_id);
CREATE UNIQUE INDEX ON mp_automatic_posting_candidates(movement_id);
CREATE UNIQUE INDEX ON mp_automatic_posting_candidates(transaction_id);

CREATE TEMP TABLE mp_automatic_posting_reversal_targets ON COMMIT DROP AS
SELECT candidate.*
FROM mp_automatic_posting_candidates candidate
JOIN mp_reconciliation_links link
  ON link.id = candidate.link_id
JOIN mp_movements movement
  ON movement.id = candidate.movement_id
JOIN transactions transaction_row
  ON transaction_row.id = candidate.transaction_id
JOIN transaction_categories category
  ON category.id = transaction_row.subcategory_id
JOIN (VALUES
  ('received_payment', 'Cobros Mercado Pago',       'income',  'entrada'),
  ('fee',              'Comisiones Mercado Pago',   'expense', 'salida'),
  ('tax',              'Impuestos Mercado Pago',    'expense', 'salida'),
  ('withholding',      'Retenciones Mercado Pago',  'expense', 'salida'),
  ('refund',           'Devoluciones Mercado Pago', 'expense', 'salida'),
  ('chargeback',       'Contracargos Mercado Pago', 'expense', 'salida')
) AS policy(classification, category_name, transaction_type, payment_direction)
  ON policy.classification = link.classification
JOIN LATERAL (
  SELECT
    count(*) AS payment_count,
    count(*) FILTER (
      WHERE lower(payment.payment_method) = lower('Mercado Pago')
        AND payment.type = policy.payment_direction
        AND payment.amount = abs(movement.amount)
    ) AS matching_payment_count
  FROM transaction_payments payment
  WHERE payment.transaction_id = transaction_row.id
) payment_shape
  ON payment_shape.payment_count = 1
 AND payment_shape.matching_payment_count = 1
WHERE movement.source_type = 'settlement_report'
  AND movement.status = 'reconciled'
  AND link.classification = movement.suggested_classification
  AND transaction_row.description IS NOT DISTINCT FROM movement.description
  AND transaction_row.date = (movement.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
  AND transaction_row.currency = movement.currency
  AND transaction_row.amount = abs(movement.amount)
  AND transaction_row.created_by IS NOT DISTINCT FROM link.reconciled_by
  AND category.name = policy.category_name
  AND category.transaction_type = policy.transaction_type;

CREATE UNIQUE INDEX ON mp_automatic_posting_reversal_targets(link_id);
CREATE UNIQUE INDEX ON mp_automatic_posting_reversal_targets(movement_id);
CREATE UNIQUE INDEX ON mp_automatic_posting_reversal_targets(transaction_id);

DO $guard$
DECLARE
  v_invalid_links text;
  v_locked_periods text;
  v_fiscal_links text;
  v_group_links text;
BEGIN
  SELECT string_agg(candidate.link_id::text, ', ' ORDER BY candidate.link_id::text)
  INTO v_invalid_links
  FROM mp_automatic_posting_candidates candidate
  LEFT JOIN mp_automatic_posting_reversal_targets target
    ON target.link_id = candidate.link_id
  WHERE target.link_id IS NULL;

  IF v_invalid_links IS NOT NULL THEN
    RAISE EXCEPTION 'No se revirtieron publicaciones automáticas de Mercado Pago: los vínculos % no conservan todas las invariantes originales. Auditá mp_reconciliation_links, mp_movements, transactions, transaction_categories y transaction_payments.', v_invalid_links;
  END IF;

  SELECT string_agg(
    DISTINCT to_char(transaction_row.date, 'YYYY-MM') || ' (transacción ' || transaction_row.id::text || ')',
    ', '
  )
  INTO v_locked_periods
  FROM mp_automatic_posting_reversal_targets target
  JOIN transactions transaction_row ON transaction_row.id = target.transaction_id
  JOIN locked_periods locked
    ON locked.year = extract(year FROM transaction_row.date)::integer
   AND locked.month = extract(month FROM transaction_row.date)::integer;

  IF v_locked_periods IS NOT NULL THEN
    RAISE EXCEPTION 'No se revirtieron publicaciones automáticas de Mercado Pago: hay períodos contables cerrados: %. Abrí o conciliá explícitamente esos períodos antes de aplicar la migración.', v_locked_periods;
  END IF;

  SELECT string_agg(
    DISTINCT fiscal_link.transaction_id::text || '→documento ' || fiscal_link.document_id::text,
    ', '
  )
  INTO v_fiscal_links
  FROM mp_automatic_posting_reversal_targets target
  JOIN fiscal_document_transactions fiscal_link
    ON fiscal_link.transaction_id = target.transaction_id
  LEFT JOIN fiscal_document_items fiscal_item
    ON fiscal_item.document_id = fiscal_link.document_id;

  IF v_fiscal_links IS NOT NULL THEN
    RAISE EXCEPTION 'No se revirtieron publicaciones automáticas de Mercado Pago: fiscal_document_transactions/fiscal_document_items referencian estas transacciones: %. Resolvé primero los comprobantes fiscales.', v_fiscal_links;
  END IF;

  SELECT string_agg(
    DISTINCT group_member.transaction_id::text || '→grupo ' || group_member.group_id::text,
    ', '
  )
  INTO v_group_links
  FROM mp_automatic_posting_reversal_targets target
  JOIN transaction_group_members group_member
    ON group_member.transaction_id = target.transaction_id;

  IF v_group_links IS NOT NULL THEN
    RAISE EXCEPTION 'No se revirtieron publicaciones automáticas de Mercado Pago: transaction_group_members contiene estas membresías: %. Desagrupá primero las transacciones.', v_group_links;
  END IF;
END;
$guard$;

INSERT INTO user_action_logs(user_id, action, entity, entity_id, metadata)
SELECT
  NULL,
  'reverse_automatic_mp_posting',
  'transactions',
  target.transaction_id,
  jsonb_build_object(
    'reason', 'Mercado Pago movements now require explicit administrator approval',
    'reconciliation_link_id', target.link_id,
    'movement_id', target.movement_id,
    'classification', target.classification,
    'reconciled_at', target.reconciled_at,
    'reconciled_by', target.reconciled_by,
    'reconciliation_notes', target.notes,
    'already_voided', target.previous_voided_at IS NOT NULL
  )
FROM mp_automatic_posting_reversal_targets target;

-- Soft-voiding preserves the accounting transaction and its payments while
-- removing their balance effect through the established ledger semantics.
UPDATE transactions transaction_row
SET voided_at = now(), voided_by = NULL
FROM mp_automatic_posting_reversal_targets target
WHERE transaction_row.id = target.transaction_id
  AND transaction_row.voided_at IS NULL;

UPDATE mp_movements movement
SET status = 'pending', updated_at = now()
FROM mp_automatic_posting_reversal_targets target
WHERE movement.id = target.movement_id;

-- A current reconciliation link cannot remain after the movement is restored
-- to pending. Its full provenance is retained in user_action_logs above.
DELETE FROM mp_reconciliation_links link
USING mp_automatic_posting_reversal_targets target
WHERE link.id = target.link_id;

-- Repair the complete pending inbox, including rows that were already pending
-- before this migration. Re-running produces the same classification, sign,
-- and description values.
WITH pending_base AS (
  SELECT
    movement.*,
    concat_ws(' ',
      movement.raw_data->>'TRANSACTION_TYPE', movement.raw_data->>'DESCRIPTION',
      movement.raw_data->>'SALE_DETAIL', movement.raw_data->>'TAX_DETAIL',
      movement.raw_data->>'SOURCE_ID', movement.raw_data->>'REASON'
    ) ~* 'bank[ _-]+transfer' AS is_bank_transfer
  FROM mp_movements movement
  WHERE movement.status = 'pending'
), pending_repaired AS (
  SELECT
    pending.id,
    CASE
      WHEN pending.is_bank_transfer THEN 'withdrawal'
      WHEN pending.suggested_classification = 'received_payment' AND pending.amount < 0 THEN 'unknown'
      ELSE pending.suggested_classification
    END AS repaired_classification,
    CASE
      WHEN pending.is_bank_transfer THEN -abs(pending.amount)
      WHEN pending.suggested_classification IN ('fee', 'tax', 'withholding', 'withdrawal', 'refund', 'chargeback')
        THEN -abs(pending.amount)
      ELSE pending.amount
    END AS repaired_amount,
    CASE
      WHEN lower(btrim(COALESCE(pending.description, ''))) ~
        '^(settlement|payment|approved|pago( aprobado)?|cobro( recibido)?|operaci[oó]n (aprobada|realizada|confirmada|exitosa)|transacci[oó]n (aprobada|realizada|confirmada|exitosa))$'
      THEN COALESCE(
        NULLIF(btrim(pending.raw_data->>'PAYER_NAME'), ''),
        NULLIF(btrim(pending.raw_data->>'SALE_DETAIL'), ''),
        NULLIF(btrim(pending.raw_data->>'EXTERNAL_REFERENCE'), ''),
        CASE WHEN NULLIF(btrim(pending.raw_data->>'POI_WALLET_NAME'), '') IS NOT NULL
          THEN 'Movimiento Mercado Pago · Billetera: ' || btrim(pending.raw_data->>'POI_WALLET_NAME') END,
        CASE WHEN NULLIF(btrim(pending.raw_data->>'POI_BANK_NAME'), '') IS NOT NULL
          THEN 'Movimiento Mercado Pago · Banco: ' || btrim(pending.raw_data->>'POI_BANK_NAME') END,
        'Movimiento Mercado Pago · MP ' || pending.external_id
      )
      ELSE pending.description
    END AS repaired_description
  FROM pending_base pending
)
UPDATE mp_movements movement
SET
  suggested_classification = repaired.repaired_classification,
  amount = repaired.repaired_amount,
  description = repaired.repaired_description,
  updated_at = now()
FROM pending_repaired repaired
WHERE movement.id = repaired.id
  AND (
    movement.suggested_classification IS DISTINCT FROM repaired.repaired_classification
    OR movement.amount IS DISTINCT FROM repaired.repaired_amount
    OR movement.description IS DISTINCT FROM repaired.repaired_description
  );
