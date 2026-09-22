-- Mercado Pago is an independent accounting source. Deterministic imported
-- movements create their own ordinary transactions; ambiguous movements stay
-- pending for an administrator. This migration intentionally does not backfill
-- existing imports: overlapping reports will process pending rows naturally.

DO $$
DECLARE
  v_job record;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    FOR v_job IN
      SELECT jobid FROM cron.job
      WHERE jobname IN ('erp-mp-daily-sync', 'erp-mp-poll-sync')
    LOOP
      PERFORM cron.unschedule(v_job.jobid);
    END LOOP;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS configure_mp_daily_sync(text, text, text, integer);

INSERT INTO transaction_categories (name, parent_id)
SELECT definition.name, parent.id
FROM (VALUES
  ('Cobros Mercado Pago', 'Ingresos'),
  ('Comisiones Mercado Pago', 'Gastos'),
  ('Impuestos Mercado Pago', 'Gastos'),
  ('Retenciones Mercado Pago', 'Gastos'),
  ('Devoluciones Mercado Pago', 'Gastos'),
  ('Contracargos Mercado Pago', 'Gastos')
) AS definition(name, parent_name)
JOIN transaction_categories parent
  ON parent.parent_id IS NULL
 AND parent.name = definition.parent_name
WHERE NOT EXISTS (
  SELECT 1
  FROM transaction_categories existing
  WHERE existing.parent_id = parent.id
    AND existing.name = definition.name
);

CREATE OR REPLACE FUNCTION post_mp_movement(
  p_movement_id uuid,
  p_actor_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement mp_movements%ROWTYPE;
  v_transaction_id uuid;
  v_category_id uuid;
  v_category_name text;
  v_transaction_type text;
  v_payment_direction text;
  v_payment_method text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;

  SELECT * INTO v_movement
  FROM mp_movements
  WHERE id = p_movement_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El movimiento de Mercado Pago no existe.'; END IF;

  SELECT transaction_id INTO v_transaction_id
  FROM mp_reconciliation_links
  WHERE movement_id = p_movement_id;
  IF FOUND THEN RETURN v_transaction_id; END IF;

  IF v_movement.status <> 'pending' THEN
    RAISE EXCEPTION 'El movimiento de Mercado Pago ya fue procesado.';
  END IF;

  SELECT policy.category_name, policy.transaction_type, policy.payment_direction
  INTO v_category_name, v_transaction_type, v_payment_direction
  FROM (VALUES
    ('received_payment', 'Cobros Mercado Pago',      'income',  'entrada'),
    ('fee',              'Comisiones Mercado Pago',  'expense', 'salida'),
    ('tax',              'Impuestos Mercado Pago',   'expense', 'salida'),
    ('withholding',      'Retenciones Mercado Pago', 'expense', 'salida'),
    ('refund',           'Devoluciones Mercado Pago','expense', 'salida'),
    ('chargeback',       'Contracargos Mercado Pago','expense', 'salida')
  ) AS policy(classification, category_name, transaction_type, payment_direction)
  WHERE policy.classification = v_movement.suggested_classification;

  -- Withdrawals need a real destination account and unknown movements need a
  -- human classification. Neither is safe to post automatically.
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF EXISTS (
    SELECT 1 FROM locked_periods
    WHERE year = extract(year FROM v_movement.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')
      AND month = extract(month FROM v_movement.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')
  ) THEN
    RAISE EXCEPTION 'El período contable del movimiento está cerrado.';
  END IF;

  SELECT name INTO v_payment_method
  FROM payment_methods
  WHERE active AND lower(name) = lower('Mercado Pago')
  ORDER BY name
  LIMIT 1;
  IF v_payment_method IS NULL THEN
    RAISE EXCEPTION 'Configurá el método de pago Mercado Pago antes de sincronizar.';
  END IF;

  SELECT id INTO v_category_id
  FROM transaction_categories
  WHERE name = v_category_name
    AND transaction_type = v_transaction_type
  ORDER BY created_at, id
  LIMIT 1;
  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'Falta la categoría contable automática "%".', v_category_name;
  END IF;

  INSERT INTO transactions(date, amount, currency, subcategory_id, description, created_by)
  VALUES (
    (v_movement.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
    abs(v_movement.amount),
    v_movement.currency,
    v_category_id,
    v_movement.description,
    p_actor_id
  )
  RETURNING id INTO v_transaction_id;

  INSERT INTO transaction_payments(transaction_id, payment_method, amount, type)
  VALUES (v_transaction_id, v_payment_method, abs(v_movement.amount), v_payment_direction);

  INSERT INTO mp_reconciliation_links(
    movement_id, transaction_id, classification, reconciled_by, notes
  ) VALUES (
    p_movement_id, v_transaction_id, v_movement.suggested_classification,
    p_actor_id, 'Publicación automática desde reporte de Mercado Pago'
  );

  UPDATE mp_movements
  SET status = 'reconciled', updated_at = now()
  WHERE id = p_movement_id;

  RETURN v_transaction_id;
END;
$$;

REVOKE ALL ON FUNCTION post_mp_movement(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION post_mp_movement(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION publish_mp_reconciliation(
  p_movement_id uuid, p_classification text, p_existing_transaction_id uuid DEFAULT NULL,
  p_subcategory_id uuid DEFAULT NULL, p_destination_payment_method text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_movement mp_movements%ROWTYPE;
  v_transaction_id uuid;
  v_amount numeric(12,2);
  v_category_id uuid;
  v_payment_method text;
BEGIN
  IF NOT integrations_is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede conciliar movimientos.';
  END IF;
  IF p_existing_transaction_id IS NOT NULL THEN
    RAISE EXCEPTION 'Mercado Pago es una fuente independiente y no puede vincularse a una transacción manual.';
  END IF;

  SELECT * INTO v_movement
  FROM mp_movements
  WHERE id = p_movement_id
  FOR UPDATE;
  IF NOT FOUND OR v_movement.status <> 'pending' THEN
    RAISE EXCEPTION 'El movimiento ya fue procesado o no existe.';
  END IF;
  IF p_classification NOT IN ('received_payment', 'fee', 'tax', 'withholding', 'withdrawal', 'refund', 'chargeback') THEN
    RAISE EXCEPTION 'Clasificación no publicable. Los movimientos desconocidos deben permanecer pendientes.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM locked_periods
    WHERE year = extract(year FROM v_movement.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')
      AND month = extract(month FROM v_movement.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')
  ) THEN
    RAISE EXCEPTION 'El período contable del movimiento está cerrado.';
  END IF;

  SELECT name INTO v_payment_method
  FROM payment_methods
  WHERE active AND lower(name) = lower('Mercado Pago')
  ORDER BY name
  LIMIT 1;
  IF v_payment_method IS NULL THEN
    RAISE EXCEPTION 'Configurá el método de pago Mercado Pago antes de conciliar.';
  END IF;
  v_amount := abs(v_movement.amount);

  IF p_classification = 'received_payment' THEN
    SELECT id INTO v_category_id
    FROM transaction_categories
    WHERE name = 'Cobros Mercado Pago' AND transaction_type = 'income'
    ORDER BY created_at, id
    LIMIT 1;
    IF v_category_id IS NULL THEN RAISE EXCEPTION 'Falta la categoría Cobros Mercado Pago.'; END IF;

    INSERT INTO transactions(date, amount, currency, subcategory_id, description, created_by)
    VALUES (
      (v_movement.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
      v_amount, v_movement.currency, v_category_id,
      COALESCE(NULLIF(btrim(p_notes), ''), v_movement.description), auth.uid()
    ) RETURNING id INTO v_transaction_id;
    INSERT INTO transaction_payments(transaction_id, payment_method, amount, type)
    VALUES (v_transaction_id, v_payment_method, v_amount, 'entrada');

  ELSIF p_classification = 'withdrawal' THEN
    IF p_destination_payment_method IS NULL
       OR lower(p_destination_payment_method) = lower(v_payment_method) THEN
      RAISE EXCEPTION 'Elegí la cuenta de destino del retiro.';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM payment_methods
      WHERE active AND name = p_destination_payment_method
    ) THEN
      RAISE EXCEPTION 'La cuenta de destino no existe o está inactiva.';
    END IF;
    SELECT id INTO v_category_id
    FROM transaction_categories
    WHERE name = 'Transferencia interna' AND transaction_type = 'transfer'
    ORDER BY created_at, id
    LIMIT 1;
    IF v_category_id IS NULL THEN RAISE EXCEPTION 'Falta la categoría Transferencia interna.'; END IF;

    INSERT INTO transactions(date, amount, currency, subcategory_id, description, created_by)
    VALUES (
      (v_movement.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
      v_amount, v_movement.currency, v_category_id,
      COALESCE(NULLIF(btrim(p_notes), ''), v_movement.description), auth.uid()
    ) RETURNING id INTO v_transaction_id;
    INSERT INTO transaction_payments(transaction_id, payment_method, amount, type) VALUES
      (v_transaction_id, v_payment_method, v_amount, 'salida'),
      (v_transaction_id, p_destination_payment_method, v_amount, 'entrada');

  ELSE
    IF p_subcategory_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM transaction_categories
      WHERE id = p_subcategory_id AND transaction_type = 'expense'
    ) THEN
      RAISE EXCEPTION 'Elegí una categoría de egreso.';
    END IF;

    INSERT INTO transactions(date, amount, currency, subcategory_id, description, created_by)
    VALUES (
      (v_movement.occurred_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,
      v_amount, v_movement.currency, p_subcategory_id,
      COALESCE(NULLIF(btrim(p_notes), ''), v_movement.description), auth.uid()
    ) RETURNING id INTO v_transaction_id;
    INSERT INTO transaction_payments(transaction_id, payment_method, amount, type)
    VALUES (v_transaction_id, v_payment_method, v_amount, 'salida');
  END IF;

  INSERT INTO mp_reconciliation_links(
    movement_id, transaction_id, classification, reconciled_by, notes
  ) VALUES (
    p_movement_id, v_transaction_id, p_classification, auth.uid(), NULLIF(btrim(p_notes), '')
  );
  UPDATE mp_movements
  SET status = 'reconciled', suggested_classification = p_classification, updated_at = now()
  WHERE id = p_movement_id;

  RETURN v_transaction_id;
END;
$$;

REVOKE ALL ON FUNCTION publish_mp_reconciliation(uuid, text, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION publish_mp_reconciliation(uuid, text, uuid, uuid, text, text) TO authenticated;
