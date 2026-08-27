ALTER TABLE supplier_debt_payments ADD COLUMN IF NOT EXISTS client_uuid uuid;
CREATE UNIQUE INDEX IF NOT EXISTS supplier_debt_payments_client_uuid_key
  ON supplier_debt_payments(client_uuid) WHERE client_uuid IS NOT NULL;

CREATE OR REPLACE FUNCTION record_supplier_debt_payment(
  p_client_uuid uuid, p_debt_id uuid, p_amount numeric, p_payment_method text,
  p_date date, p_subcategory_id uuid, p_notes text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_payment_id uuid; v_transaction_id uuid;
  v_total numeric(12,2); v_paid numeric(12,2); v_supplier_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'Solo un administrador puede pagar deudas a proveedores.'; END IF;
  IF p_client_uuid IS NULL THEN RAISE EXCEPTION 'client_uuid es obligatorio.'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_client_uuid::text, 3));
  SELECT id INTO v_payment_id FROM supplier_debt_payments WHERE client_uuid = p_client_uuid;
  IF FOUND THEN RETURN v_payment_id; END IF;
  IF p_amount IS NULL OR round(p_amount, 2) <= 0 OR p_date IS NULL THEN
    RAISE EXCEPTION 'El importe y la fecha de pago son obligatorios.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE active AND name = p_payment_method) THEN
    RAISE EXCEPTION 'El método de pago no existe o está inactivo.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM transaction_categories WHERE id = p_subcategory_id AND parent_id IS NOT NULL AND transaction_type = 'expense')
    THEN RAISE EXCEPTION 'La categoría debe ser una subcategoría de gasto.'; END IF;

  SELECT d.total_amount, d.paid_amount, s.name INTO v_total, v_paid, v_supplier_name
  FROM supplier_debts d LEFT JOIN suppliers s ON s.id = d.supplier_id
  WHERE d.id = p_debt_id FOR UPDATE OF d;
  IF NOT FOUND THEN RAISE EXCEPTION 'La deuda indicada no existe.'; END IF;
  IF round(p_amount, 2) > round(v_total - v_paid, 2) THEN
    RAISE EXCEPTION 'El importe supera el saldo pendiente de la deuda.';
  END IF;

  INSERT INTO transactions (date, amount, currency, subcategory_id, description,
    is_seña, seña_amount, created_by, client_uuid) VALUES (
    p_date, round(p_amount, 2), 'ARS', p_subcategory_id,
    'Pago deuda proveedor' || COALESCE(' - ' || v_supplier_name, ''),
    false, null, auth.uid(), p_client_uuid) RETURNING id INTO v_transaction_id;
  INSERT INTO transaction_payments (transaction_id, payment_method, instrument, amount, type)
    VALUES (v_transaction_id, p_payment_method, null, round(p_amount, 2), 'salida');
  INSERT INTO supplier_debt_payments (debt_id, amount, payment_method, date,
    transaction_id, notes, client_uuid) VALUES (p_debt_id, round(p_amount, 2),
    p_payment_method, p_date, v_transaction_id, p_notes, p_client_uuid)
    RETURNING id INTO v_payment_id;
  UPDATE supplier_debts SET paid_amount = paid_amount + round(p_amount, 2) WHERE id = p_debt_id;
  RETURN v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION record_supplier_debt_payment(uuid, uuid, numeric, text, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_supplier_debt_payment(uuid, uuid, numeric, text, date, uuid, text) TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE supplier_debt_payments FROM PUBLIC, anon, authenticated;
REVOKE UPDATE, DELETE ON TABLE supplier_debts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE supplier_debt_payments TO authenticated;
