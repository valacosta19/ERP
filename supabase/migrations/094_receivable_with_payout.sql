-- Cuentas por cobrar que nacen de una salida real de dinero (préstamo o
-- adelanto en efectivo): además del receivable, registran la transacción de
-- egreso y su pago, de forma atómica.

DO $guard$
DECLARE v_faltan text;
BEGIN
  SELECT string_agg(t, ', ') INTO v_faltan
  FROM unnest(ARRAY['receivables','transactions','transaction_payments','payment_methods','transaction_categories']) AS t
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
  );
  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan tablas requeridas por esta migración: %.', v_faltan;
  END IF;
END $guard$;

INSERT INTO transaction_categories (name, parent_id)
SELECT 'Préstamos otorgados', id
FROM transaction_categories
WHERE name = 'Movimientos' AND parent_id IS NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION create_receivable_with_payout(
  p_client_uuid    uuid,
  p_debtor_name    text,
  p_concept        text,
  p_amount         numeric,
  p_currency       text,
  p_payment_method text,
  p_date           date,
  p_due_date       date,
  p_notes          text,
  p_created_by     uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receivable_id  uuid;
  v_tx_id          uuid;
  v_subcategory_id uuid;
  v_amount         numeric(12,2);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_client_uuid IS NOT NULL THEN
    SELECT id INTO v_receivable_id FROM receivables WHERE client_uuid = p_client_uuid;
    IF FOUND THEN
      RETURN v_receivable_id;
    END IF;
  END IF;

  IF p_debtor_name IS NULL OR btrim(p_debtor_name) = '' THEN
    RAISE EXCEPTION 'El deudor es obligatorio.';
  END IF;
  IF p_concept IS NULL OR btrim(p_concept) = '' THEN
    RAISE EXCEPTION 'El concepto es obligatorio.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor que cero.';
  END IF;
  IF p_currency IS NULL OR p_currency NOT IN ('ARS', 'USD', 'EUR') THEN
    RAISE EXCEPTION 'La moneda no es válida.';
  END IF;
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'La fecha de la salida de dinero es obligatoria.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE name = p_payment_method AND active) THEN
    RAISE EXCEPTION 'Método de pago inválido o inactivo: %', COALESCE(p_payment_method, '(nulo)');
  END IF;

  v_amount := round(p_amount, 2);

  SELECT c.id INTO v_subcategory_id
  FROM transaction_categories c
  JOIN transaction_categories p ON p.id = c.parent_id
  WHERE c.name = 'Préstamos otorgados' AND p.name = 'Movimientos';
  IF v_subcategory_id IS NULL THEN
    RAISE EXCEPTION 'No existe la subcategoría "Préstamos otorgados" bajo "Movimientos".';
  END IF;

  BEGIN
    INSERT INTO transactions (
      date, amount, currency, subcategory_id, description,
      is_seña, seña_amount, catalog_item_id,
      product_id, inventory_pending, created_by, client_uuid
    ) VALUES (
      p_date, v_amount, p_currency, v_subcategory_id,
      btrim(p_concept) || ' - ' || btrim(p_debtor_name),
      false, null, null,
      null, false, p_created_by, p_client_uuid
    )
    RETURNING id INTO v_tx_id;

    INSERT INTO transaction_payments (
      transaction_id, payment_method, instrument, amount, type
    ) VALUES (
      v_tx_id, p_payment_method, null, v_amount, 'salida'
    );

    INSERT INTO receivables (
      debtor_name, concept, total_amount, collected_amount, currency,
      due_date, notes, created_by, source_transaction_id, client_uuid
    ) VALUES (
      btrim(p_debtor_name), btrim(p_concept), v_amount, 0, p_currency,
      p_due_date, p_notes, p_created_by, v_tx_id, p_client_uuid
    )
    RETURNING id INTO v_receivable_id;

  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_receivable_id FROM receivables WHERE client_uuid = p_client_uuid;
    RETURN v_receivable_id;
  END;

  RETURN v_receivable_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_receivable_with_payout(
  uuid, text, text, numeric, text, text, date, date, text, uuid
) TO authenticated;
