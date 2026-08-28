-- ============================================================
-- Las reservas pasan a mover plata de verdad, no a marcarla.
--
-- Las cuentas de reserva son cuentas reales en Mercado Pago, separadas del
-- saldo principal. Transferir a una reserva saca plata de la cuenta principal.
--
-- Hasta ahora el movimiento no escribía transaction_payments, así que para el
-- sistema la plata seguía en el método de origen y FondosPage la descontaba a
-- mano en la pantalla. Con ese modelo la píldora de Mercado Pago en
-- Transacciones mostraba principal + reservas juntas, que es justo lo que no
-- sirve para cotejar cuenta por cuenta.
--
-- Ahora cada movimiento registra de qué cuenta sale y escribe su fila de pago:
-- 'salida' al transferir, 'entrada' al retornar. El saldo del método baja solo,
-- y FondosPage deja de restar el total reservado (restaría dos veces).
--
-- Las cuatro transferencias del 2026-03-04 ya tenían su fila de pago y quedan
-- intactas: eran correctas. Lo que las contaba dos veces era la resta de la
-- pantalla, que se elimina en el frontend.
--
-- Todas las reservas cargadas hasta hoy salieron de Mercado Pago.
-- ============================================================

ALTER TABLE reserve_movements ADD COLUMN IF NOT EXISTS payment_method text;

DO $$
DECLARE
  v_method   text := 'Mercado Pago';
  v_inserted int;
  v_null     int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM payment_methods WHERE name = v_method) THEN
    RAISE EXCEPTION 'No existe el método de pago "%". Verificar el nombre exacto en Ajustes.', v_method;
  END IF;

  -- Solo los espejos que no tienen ninguna fila de pago. Los cuatro de marzo
  -- ya la tienen y no se tocan.
  INSERT INTO transaction_payments (transaction_id, payment_method, instrument, amount, type)
  SELECT m.transaction_id, v_method, null, abs(m.amount),
         CASE WHEN m.amount < 0 THEN 'entrada' ELSE 'salida' END
  FROM reserve_movements m
  JOIN transactions t ON t.id = m.transaction_id AND t.voided_at IS NULL
  WHERE m.transaction_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM transaction_payments p WHERE p.transaction_id = m.transaction_id);
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'Filas de pago insertadas: %', v_inserted;

  -- La cuenta de origen queda también en el movimiento, para que Fondos no
  -- dependa del espejo para mostrarla. Mismo criterio que supplier_debt_payments.
  UPDATE reserve_movements m
  SET payment_method = COALESCE(
        (SELECT p.payment_method FROM transaction_payments p
          WHERE p.transaction_id = m.transaction_id LIMIT 1),
        v_method);

  SELECT count(*) INTO v_null FROM reserve_movements WHERE payment_method IS NULL;
  IF v_null > 0 THEN
    RAISE EXCEPTION 'Quedaron % movimientos sin cuenta de origen.', v_null;
  END IF;
END $$;

ALTER TABLE reserve_movements ALTER COLUMN payment_method SET NOT NULL;
