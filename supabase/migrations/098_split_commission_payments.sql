-- One commission installment owns one accounting transaction. The net cash
-- payout may be split across accounts, but offsets remain domain-only rows and
-- are consumed exactly once under the same receivable locks.

CREATE OR REPLACE FUNCTION record_partial_commission_payout_multi(
  p_client_uuid        uuid,
  p_hairdresser_id     uuid,
  p_period_start       date,
  p_period_end         date,
  p_installment_amount numeric,
  p_receivable_ids     uuid[],
  p_payments           jsonb,
  p_payment_date       date,
  p_subcategory_id     uuid,
  p_notes              text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout_id          uuid;
  v_period_id          uuid;
  v_transaction_id     uuid;
  v_hairdresser_name   text;
  v_period_gross       numeric(12,2);
  v_settled            numeric(12,2);
  v_available          numeric(12,2);
  v_installment        numeric(12,2);
  v_offset             numeric(12,2) := 0;
  v_net                numeric(12,2);
  v_payment_total      numeric(12,2) := 0;
  v_payment_method     text;
  v_receivable         record;
  v_remaining          numeric(12,2);
  v_expected_count     integer;
  v_found_count        integer := 0;
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

  -- Replays return the committed payout before revalidating mutable catalogs,
  -- current period totals, or receivable balances.
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

  IF p_payments IS NULL OR jsonb_typeof(p_payments) <> 'array' THEN
    RAISE EXCEPTION 'La distribución de pagos debe ser un arreglo.';
  END IF;

  -- Validate JSON shapes before numeric casts so malformed payloads fail with
  -- a domain error instead of an opaque PostgreSQL conversion error.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payments) payment
    WHERE jsonb_typeof(payment) <> 'object'
       OR jsonb_typeof(payment->'payment_method') <> 'string'
       OR jsonb_typeof(payment->'currency') <> 'string'
       OR jsonb_typeof(payment->'amount') <> 'number'
  ) THEN
    RAISE EXCEPTION 'Cada pago debe incluir método, moneda e importe.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payments) payment
    WHERE NULLIF(payment->>'payment_method', '') IS NULL
       OR payment->>'currency' <> 'ARS'
       OR (payment->>'amount')::numeric <= 0
       OR (payment->>'amount')::numeric <> round((payment->>'amount')::numeric, 2)
       OR NOT EXISTS (
         SELECT 1
         FROM payment_methods method
         WHERE method.active = true
           AND method.name = payment->>'payment_method'
       )
  ) THEN
    RAISE EXCEPTION 'Todos los pagos deben usar ARS, un método activo y un importe positivo de hasta dos decimales.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_payments) payment
    GROUP BY lower(payment->>'payment_method')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Un método de pago no puede repetirse dentro de la misma liquidación.';
  END IF;

  SELECT COALESCE(sum(round((payment->>'amount')::numeric, 2)), 0)
  INTO v_payment_total
  FROM jsonb_array_elements(p_payments) payment;

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

  -- Serialize all settlement periods for this professional so overlap checks,
  -- gross availability, and offsets are decided from one consistent state.
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
    JOIN transactions transaction_row ON transaction_row.id = th.transaction_id
    WHERE th.hairdresser_id = p_hairdresser_id
      AND transaction_row.date BETWEEN p_period_start AND p_period_end
      AND transaction_row.voided_at IS NULL
      AND transaction_row.currency <> 'ARS'
  ) THEN
    RAISE EXCEPTION 'El período contiene comisiones en moneda extranjera. Registrá primero una cotización persistida para poder liquidarlas de forma segura.';
  END IF;

  SELECT round(COALESCE(sum(
    (transaction_row.amount + COALESCE(transaction_row.seña_amount, 0))
      * th.commission_rate / 100
  ), 0), 2)
  INTO v_period_gross
  FROM transaction_hairdressers th
  JOIN transactions transaction_row ON transaction_row.id = th.transaction_id
  WHERE th.hairdresser_id = p_hairdresser_id
    AND transaction_row.date BETWEEN p_period_start AND p_period_end
    AND transaction_row.voided_at IS NULL
    AND transaction_row.currency = 'ARS';

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
    SELECT id, total_amount, collected_amount, currency, hairdresser_id
    FROM receivables
    WHERE id = ANY(COALESCE(p_receivable_ids, ARRAY[]::uuid[]))
    ORDER BY id
    FOR UPDATE
  LOOP
    v_found_count := v_found_count + 1;

    IF v_receivable.hairdresser_id IS DISTINCT FROM p_hairdresser_id THEN
      RAISE EXCEPTION 'El retiro % no pertenece a la profesional indicada.', v_receivable.id;
    END IF;
    IF v_receivable.currency <> 'ARS' THEN
      RAISE EXCEPTION 'El retiro % no está expresado en ARS y no puede compensarse sin una cotización persistida.', v_receivable.id;
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

  v_net := round(v_installment - v_offset, 2);
  IF v_net > 0 THEN
    IF jsonb_array_length(p_payments) = 0 THEN
      RAISE EXCEPTION 'La liquidación debe incluir al menos un método de pago.';
    END IF;
    IF v_payment_total <> v_net THEN
      RAISE EXCEPTION 'La suma de los pagos (%) debe coincidir con el neto a pagar (%).', v_payment_total, v_net;
    END IF;
    IF p_subcategory_id IS NULL THEN
      RAISE EXCEPTION 'La categoría de gasto es obligatoria cuando hay un pago neto.';
    END IF;
  ELSIF jsonb_array_length(p_payments) <> 0 THEN
    RAISE EXCEPTION 'Una liquidación cubierta por retiros no debe generar pagos monetarios.';
  END IF;

  SELECT CASE count(*)
    WHEN 0 THEN 'Compensación'
    WHEN 1 THEN min(payment->>'payment_method')
    ELSE 'Mixto'
  END
  INTO v_payment_method
  FROM jsonb_array_elements(p_payments) payment;

  v_payout_id := gen_random_uuid();

  IF v_net > 0 THEN
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
    )
    SELECT
      v_transaction_id,
      payment->>'payment_method',
      null,
      round((payment->>'amount')::numeric, 2),
      'salida'
    FROM jsonb_array_elements(p_payments) payment;
  END IF;

  INSERT INTO commission_payouts (
    id, settlement_period_id, hairdresser_id, period_start, period_end,
    gross_amount, receivables_offset, net_amount,
    paid_via_transaction_id, payment_method, payment_date,
    client_uuid, notes, created_by
  ) VALUES (
    v_payout_id, v_period_id, p_hairdresser_id, p_period_start, p_period_end,
    v_installment, v_offset, v_net,
    v_transaction_id, v_payment_method, p_payment_date,
    p_client_uuid, p_notes, auth.uid()
  );

  -- Offsets are collections for the domain ledger, not cash-account entries.
  -- One collection and one join row are written for each locked receivable.
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
      v_receivable.id, v_remaining, 'Compensación', p_payment_date,
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

-- Compatibility wrapper for existing single-method clients. It delegates to
-- the canonical multi-payment function and preserves idempotent retries.
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
  v_offset   numeric(12,2);
  v_net      numeric(12,2);
  v_payments jsonb;
BEGIN
  SELECT COALESCE(sum(round(GREATEST(total_amount - collected_amount, 0), 2)), 0)
  INTO v_offset
  FROM receivables
  WHERE id = ANY(COALESCE(p_receivable_ids, ARRAY[]::uuid[]));

  v_net := round(p_installment_amount - v_offset, 2);
  v_payments := CASE
    WHEN v_net > 0 THEN jsonb_build_array(jsonb_build_object(
      'payment_method', p_payment_method,
      'currency', 'ARS',
      'amount', v_net
    ))
    ELSE '[]'::jsonb
  END;

  RETURN record_partial_commission_payout_multi(
    p_client_uuid,
    p_hairdresser_id,
    p_period_start,
    p_period_end,
    p_installment_amount,
    p_receivable_ids,
    v_payments,
    p_payment_date,
    p_subcategory_id,
    p_notes
  );
END;
$$;

COMMENT ON FUNCTION record_partial_commission_payout_multi(
  uuid, uuid, date, date, numeric, uuid[], jsonb, date, uuid, text
) IS 'Atomically records one commission installment, its offsets, one accounting transaction, and one or more payment-account rows whose sum equals the net payout.';

REVOKE ALL ON FUNCTION record_partial_commission_payout_multi(
  uuid, uuid, date, date, numeric, uuid[], jsonb, date, uuid, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_partial_commission_payout_multi(
  uuid, uuid, date, date, numeric, uuid[], jsonb, date, uuid, text
) TO authenticated;

REVOKE ALL ON FUNCTION record_partial_commission_payout(
  uuid, uuid, date, date, numeric, uuid[], text, date, uuid, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_partial_commission_payout(
  uuid, uuid, date, date, numeric, uuid[], text, date, uuid, text
) TO authenticated;
