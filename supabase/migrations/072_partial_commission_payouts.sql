-- Partial commission settlements.
-- Each commission_payouts row represents one settled gross installment for an
-- exact professional + period. Cash paid plus receivables offset must equal it.

ALTER TABLE commission_payouts
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_date date,
  ADD COLUMN IF NOT EXISTS client_uuid uuid,
  ADD COLUMN IF NOT EXISTS settlement_period_id uuid;

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS commission_settlement_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hairdresser_id uuid NOT NULL REFERENCES hairdressers(id) ON DELETE RESTRICT,
  period_start date NOT NULL,
  period_end date NOT NULL,
  gross_amount numeric(12,2) NOT NULL CHECK (gross_amount >= 0),
  legacy boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_settlement_period_valid CHECK (period_start <= period_end),
  CONSTRAINT commission_settlement_period_exact UNIQUE (hairdresser_id, period_start, period_end),
  CONSTRAINT commission_settlement_period_identity UNIQUE (id, hairdresser_id, period_start, period_end),
  CONSTRAINT commission_settlement_period_no_overlap EXCLUDE USING gist (
    hairdresser_id WITH =,
    daterange(period_start, period_end, '[]') WITH &&
  ) WHERE (legacy = false)
);

ALTER TABLE commission_settlement_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_commission_settlement_periods"
  ON commission_settlement_periods
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

INSERT INTO commission_settlement_periods (
  hairdresser_id, period_start, period_end, gross_amount, legacy
)
SELECT
  cp.hairdresser_id,
  cp.period_start,
  cp.period_end,
  round(COALESCE(SUM(
    CASE WHEN t.currency = 'ARS' AND t.voided_at IS NULL
      THEN (t.amount + COALESCE(t.seña_amount, 0)) * th.commission_rate / 100
      ELSE 0
    END
  ), 0), 2),
  true
FROM (
  SELECT DISTINCT hairdresser_id, period_start, period_end
  FROM commission_payouts
) cp
LEFT JOIN transaction_hairdressers th
  ON th.hairdresser_id = cp.hairdresser_id
LEFT JOIN transactions t
  ON t.id = th.transaction_id
  AND t.date BETWEEN cp.period_start AND cp.period_end
GROUP BY cp.hairdresser_id, cp.period_start, cp.period_end;

UPDATE commission_payouts cp
SET settlement_period_id = period.id
FROM commission_settlement_periods period
WHERE period.hairdresser_id = cp.hairdresser_id
  AND period.period_start = cp.period_start
  AND period.period_end = cp.period_end
  AND cp.settlement_period_id IS NULL;

ALTER TABLE commission_payouts
  ADD CONSTRAINT commission_payouts_settlement_period_fk
    FOREIGN KEY (settlement_period_id, hairdresser_id, period_start, period_end)
    REFERENCES commission_settlement_periods(id, hairdresser_id, period_start, period_end)
    ON DELETE RESTRICT;

UPDATE commission_payouts cp
SET
  payment_date = COALESCE(cp.payment_date, t.date, cp.created_at::date),
  payment_method = COALESCE(cp.payment_method, tp.payment_method, 'Compensación')
FROM transactions t
LEFT JOIN LATERAL (
  SELECT payment_method
  FROM transaction_payments
  WHERE transaction_id = t.id
  ORDER BY created_at, id
  LIMIT 1
) tp ON true
WHERE cp.paid_via_transaction_id = t.id
  AND (cp.payment_date IS NULL OR cp.payment_method IS NULL);

UPDATE commission_payouts
SET
  payment_date = COALESCE(payment_date, created_at::date),
  payment_method = COALESCE(payment_method, 'Compensación')
WHERE payment_date IS NULL OR payment_method IS NULL;

ALTER TABLE commission_payouts
  ALTER COLUMN payment_method SET NOT NULL,
  ALTER COLUMN payment_date SET NOT NULL,
  ALTER COLUMN settlement_period_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS commission_payouts_client_uuid_key
  ON commission_payouts(client_uuid)
  WHERE client_uuid IS NOT NULL;

ALTER TABLE commission_payouts
  ADD CONSTRAINT commission_payouts_positive_gross
    CHECK (gross_amount > 0) NOT VALID,
  ADD CONSTRAINT commission_payouts_amounts_match
    CHECK (abs(gross_amount - receivables_offset - net_amount) <= 0.01) NOT VALID;

CREATE OR REPLACE FUNCTION record_partial_commission_payout(
  p_client_uuid        uuid,
  p_hairdresser_id     uuid,
  p_period_start       date,
  p_period_end         date,
  p_installment_amount numeric,
  p_receivable_ids     uuid[],
  p_payment_method     text,
  p_payment_date       date,
  p_subcategory_id     uuid,
  p_notes              text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout_id       uuid;
  v_period_id       uuid;
  v_transaction_id  uuid;
  v_hairdresser_name text;
  v_period_gross    numeric(12,2);
  v_settled         numeric(12,2);
  v_available       numeric(12,2);
  v_installment     numeric(12,2);
  v_offset          numeric(12,2) := 0;
  v_net             numeric(12,2);
  v_receivable      RECORD;
  v_remaining       numeric(12,2);
  v_expected_count  integer;
  v_found_count     integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Solo un administrador puede liquidar comisiones.';
  END IF;

  IF p_client_uuid IS NULL THEN
    RAISE EXCEPTION 'client_uuid es obligatorio.';
  END IF;

  -- A retry must replay the committed result even if methods, categories,
  -- exchange-rate support, or current period data changed after the first call.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_client_uuid::text, 1));
  SELECT id INTO v_payout_id
  FROM commission_payouts
  WHERE client_uuid = p_client_uuid;
  IF FOUND THEN
    RETURN v_payout_id;
  END IF;

  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_start > p_period_end THEN
    RAISE EXCEPTION 'El período de comisión es inválido.';
  END IF;

  IF p_payment_date IS NULL THEN
    RAISE EXCEPTION 'La fecha de pago es obligatoria.';
  END IF;

  v_installment := round(p_installment_amount, 2);
  IF v_installment IS NULL OR v_installment <= 0 THEN
    RAISE EXCEPTION 'El importe a liquidar debe ser mayor que cero.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM payment_methods
    WHERE active = true AND name = p_payment_method
  ) THEN
    RAISE EXCEPTION 'El método de pago no existe o está inactivo.';
  END IF;

  IF p_subcategory_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM transaction_categories
    WHERE id = p_subcategory_id
      AND parent_id IS NOT NULL
      AND transaction_type = 'expense'
  ) THEN
    RAISE EXCEPTION 'La categoría debe ser una subcategoría de gasto.';
  END IF;

  SELECT name INTO v_hairdresser_name
  FROM hairdressers
  WHERE id = p_hairdresser_id;

  IF v_hairdresser_name IS NULL THEN
    RAISE EXCEPTION 'Profesional no encontrada.';
  END IF;

  -- Serialize every settlement period for this professional. The broader
  -- professional lock makes the no-overlap decision deterministic.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_hairdresser_id::text, 2));

  IF EXISTS (
    SELECT 1
    FROM commission_settlement_periods
    WHERE hairdresser_id = p_hairdresser_id
      AND daterange(period_start, period_end, '[]')
        && daterange(p_period_start, p_period_end, '[]')
      AND ROW(period_start, period_end) IS DISTINCT FROM ROW(p_period_start, p_period_end)
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM commission_settlement_periods
      WHERE hairdresser_id = p_hairdresser_id
        AND legacy = true
        AND daterange(period_start, period_end, '[]')
          && daterange(p_period_start, p_period_end, '[]')
        AND ROW(period_start, period_end) IS DISTINCT FROM ROW(p_period_start, p_period_end)
    ) THEN
      RAISE EXCEPTION 'El período se superpone con una liquidación histórica de distinto rango. La ambigüedad debe resolverse manualmente antes de registrar otra cuota.';
    END IF;

    RAISE EXCEPTION 'El período se superpone con otra liquidación de la profesional. Usá exactamente el mismo rango o elegí uno que no se superponga.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM transaction_hairdressers th
    JOIN transactions t ON t.id = th.transaction_id
    WHERE th.hairdresser_id = p_hairdresser_id
      AND t.date BETWEEN p_period_start AND p_period_end
      AND t.voided_at IS NULL
      AND t.currency <> 'ARS'
  ) THEN
    RAISE EXCEPTION 'El período contiene comisiones en moneda extranjera. Registrá primero una cotización persistida para poder liquidarlas de forma segura.';
  END IF;

  SELECT round(COALESCE(SUM(
    (t.amount + COALESCE(t.seña_amount, 0)) * th.commission_rate / 100
  ), 0), 2)
  INTO v_period_gross
  FROM transaction_hairdressers th
  JOIN transactions t ON t.id = th.transaction_id
  WHERE th.hairdresser_id = p_hairdresser_id
    AND t.date BETWEEN p_period_start AND p_period_end
    AND t.voided_at IS NULL
    AND t.currency = 'ARS';

  SELECT id INTO v_period_id
  FROM commission_settlement_periods
  WHERE hairdresser_id = p_hairdresser_id
    AND period_start = p_period_start
    AND period_end = p_period_end
  FOR UPDATE;

  IF v_period_id IS NULL THEN
    INSERT INTO commission_settlement_periods (
      hairdresser_id, period_start, period_end, gross_amount, legacy
    ) VALUES (
      p_hairdresser_id, p_period_start, p_period_end, v_period_gross, false
    )
    RETURNING id INTO v_period_id;
  ELSE
    UPDATE commission_settlement_periods
    SET gross_amount = v_period_gross
    WHERE id = v_period_id;
  END IF;

  SELECT COALESCE(sum(gross_amount), 0)
  INTO v_settled
  FROM commission_payouts
  WHERE settlement_period_id = v_period_id;

  v_available := v_period_gross - v_settled;
  IF v_installment > v_available + 0.001 THEN
    RAISE EXCEPTION 'El importe supera el saldo pendiente de comisión (%).', GREATEST(v_available, 0);
  END IF;

  SELECT count(DISTINCT id)
  INTO v_expected_count
  FROM unnest(COALESCE(p_receivable_ids, ARRAY[]::uuid[])) AS ids(id);

  FOR v_receivable IN
    SELECT id, total_amount, collected_amount, hairdresser_id
    FROM receivables
    WHERE id = ANY(COALESCE(p_receivable_ids, ARRAY[]::uuid[]))
    ORDER BY id
    FOR UPDATE
  LOOP
    v_found_count := v_found_count + 1;

    IF v_receivable.hairdresser_id IS DISTINCT FROM p_hairdresser_id THEN
      RAISE EXCEPTION 'El retiro % no pertenece a la profesional indicada.', v_receivable.id;
    END IF;

    v_remaining := round(v_receivable.total_amount - v_receivable.collected_amount, 2);
    IF v_remaining <= 0 THEN
      RAISE EXCEPTION 'El retiro % ya no tiene saldo pendiente.', v_receivable.id;
    END IF;

    v_offset := v_offset + v_remaining;
  END LOOP;

  IF v_found_count <> v_expected_count THEN
    RAISE EXCEPTION 'Uno o más retiros seleccionados no existen.';
  END IF;

  IF v_offset > v_installment + 0.001 THEN
    RAISE EXCEPTION 'Los retiros seleccionados (%) superan el importe de esta liquidación (%).', v_offset, v_installment;
  END IF;

  v_net := v_installment - v_offset;
  v_payout_id := gen_random_uuid();

  IF v_net > 0 THEN
    IF p_subcategory_id IS NULL THEN
      RAISE EXCEPTION 'La categoría de gasto es obligatoria cuando hay un pago neto.';
    END IF;

    INSERT INTO transactions (
      date, amount, currency, description, subcategory_id,
      catalog_item_id, is_seña, seña_amount, product_id,
      inventory_pending, created_by, client_uuid
    ) VALUES (
      p_payment_date, v_net, 'ARS',
      'Pago de comisión ' || p_period_start || ' a ' || p_period_end || ' - ' || v_hairdresser_name,
      p_subcategory_id,
      null, false, null, null,
      false, auth.uid(), p_client_uuid
    )
    RETURNING id INTO v_transaction_id;

    INSERT INTO transaction_payments (
      transaction_id, payment_method, instrument, amount, type
    ) VALUES (
      v_transaction_id, p_payment_method, null, v_net, 'salida'
    );
  END IF;

  INSERT INTO commission_payouts (
    id, settlement_period_id, hairdresser_id, period_start, period_end,
    gross_amount, receivables_offset, net_amount,
    paid_via_transaction_id, payment_method, payment_date,
    client_uuid, notes, created_by
  ) VALUES (
    v_payout_id, v_period_id, p_hairdresser_id, p_period_start, p_period_end,
    v_installment, v_offset, v_net,
    v_transaction_id, p_payment_method, p_payment_date,
    p_client_uuid, p_notes, auth.uid()
  );

  FOR v_receivable IN
    SELECT id, total_amount, collected_amount
    FROM receivables
    WHERE id = ANY(COALESCE(p_receivable_ids, ARRAY[]::uuid[]))
    ORDER BY id
  LOOP
    v_remaining := round(v_receivable.total_amount - v_receivable.collected_amount, 2);

    INSERT INTO receivable_collections (
      receivable_id, amount, payment_method, date, transaction_id, notes
    ) VALUES (
      v_receivable.id, v_remaining, p_payment_method, p_payment_date,
      v_transaction_id, 'Compensado contra liquidación de comisión'
    );

    UPDATE receivables
    SET collected_amount = collected_amount + v_remaining
    WHERE id = v_receivable.id;

    INSERT INTO commission_payout_receivables (payout_id, receivable_id, amount)
    VALUES (v_payout_id, v_receivable.id, v_remaining);
  END LOOP;

  RETURN v_payout_id;
END;
$$;

REVOKE ALL ON FUNCTION record_partial_commission_payout(uuid, uuid, date, date, numeric, uuid[], text, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_partial_commission_payout(uuid, uuid, date, date, numeric, uuid[], text, date, uuid, text) TO authenticated;

-- The browser now uses the atomic RPC above. Prevent direct callers from using
-- the legacy non-atomic settlement endpoint and bypassing cumulative limits.
REVOKE ALL ON FUNCTION settle_commission_payout(uuid, date, date, numeric, uuid[], uuid, text, date, text, uuid) FROM PUBLIC, anon, authenticated;

-- Settlement writes are RPC-only. RLS remains defense in depth, while table
-- privileges prevent authenticated administrators from bypassing the atomic
-- cap, idempotency, or overlap checks through the REST table endpoints.
REVOKE INSERT, UPDATE, DELETE ON TABLE
  commission_settlement_periods,
  commission_payouts,
  commission_payout_receivables
FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE
  commission_settlement_periods,
  commission_payouts,
  commission_payout_receivables
TO authenticated;
