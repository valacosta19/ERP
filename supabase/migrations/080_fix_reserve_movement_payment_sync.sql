-- ============================================================
-- FIX: update_reserve_movement dejaba desincronizado el pago de la transacción.
--
-- La 076 asumió que un espejo de reserva nunca tiene transaction_payments —
-- es lo que documenta el módulo y lo que hace el hook. Pero hay espejos
-- históricos que sí lo tienen, cargados a mano desde el formulario de
-- transacciones. En esos casos editar el monto de la reserva actualizaba
-- transactions.amount y dejaba el pago con el importe viejo, y los saldos por
-- método de pago se calculan desde transaction_payments: quedaban mal.
--
-- Ahora el RPC sincroniza también el pago cuando hay exactamente uno. Si el
-- espejo tuviera el importe repartido en varios pagos, no hay forma de
-- distribuir la diferencia sin inventar un criterio: aborta y no toca nada.
-- ============================================================

CREATE OR REPLACE FUNCTION update_reserve_movement(
  p_id uuid, p_amount numeric, p_date date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_old_amount     numeric(12,2);
  v_transaction_id uuid;
  v_new_amount     numeric(12,2);
  v_mirror_updated boolean := false;
  v_payment_count  int     := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN RAISE EXCEPTION 'Solo un administrador puede editar movimientos de reserva.'; END IF;

  IF p_amount IS NULL OR round(p_amount, 2) <= 0 OR p_date IS NULL THEN
    RAISE EXCEPTION 'El importe y la fecha son obligatorios.';
  END IF;

  SELECT amount, transaction_id INTO v_old_amount, v_transaction_id
  FROM reserve_movements WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El movimiento de reserva no existe.'; END IF;

  v_new_amount := CASE WHEN v_old_amount < 0
    THEN -round(p_amount, 2) ELSE round(p_amount, 2) END;

  -- Si el espejo reparte el importe en varios pagos, abortar antes de tocar nada.
  IF v_transaction_id IS NOT NULL THEN
    SELECT count(*) INTO v_payment_count
    FROM transaction_payments WHERE transaction_id = v_transaction_id;
    IF v_payment_count > 1 THEN
      RAISE EXCEPTION 'La transacción asociada tiene % pagos. Editala desde Transacciones para repartir el importe.', v_payment_count;
    END IF;
  END IF;

  UPDATE reserve_movements
  SET amount = v_new_amount, date = p_date
  WHERE id = p_id;

  IF v_transaction_id IS NOT NULL THEN
    UPDATE transactions
    SET amount = abs(v_new_amount), date = p_date
    WHERE id = v_transaction_id AND voided_at IS NULL;
    v_mirror_updated := FOUND;

    IF v_mirror_updated AND v_payment_count = 1 THEN
      UPDATE transaction_payments
      SET amount = abs(v_new_amount)
      WHERE transaction_id = v_transaction_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('mirror_updated', v_mirror_updated);
END;
$$;

REVOKE ALL ON FUNCTION update_reserve_movement(uuid, numeric, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION update_reserve_movement(uuid, numeric, date) TO authenticated;
