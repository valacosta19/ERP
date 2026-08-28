-- ============================================================
-- Corrige y enlaza el movimiento de la reserva 'reinversión' restaurado en 048.
--
-- La 048 reinsertó el movimiento perdido con fecha '2025-03-04', un año antes
-- de lo que corresponde: el resto del negocio arranca en febrero de 2026, y ese
-- mismo 2026-03-04 hay otras tres transferencias de reserva (emergencia,
-- utilidades, Olaplex) cargadas en la misma tanda. La transacción espejo de
-- reinversión nunca se perdió — lo que se borró fue la fila de reserve_movements.
--
-- El espejo quedó con la descripción 'Transferencia → Reserva reinversión'
-- porque la cuenta se llamaba así antes de renombrarse a 'reinversión'. Por eso
-- el backfill de la 076 no lo encontró: exigía fecha y descripción exactas.
--
-- Dos cambios sobre la misma fila: se le corrige el año y se la enlaza con su
-- transacción. El saldo de la reserva no se mueve — es una suma sin fecha.
--
-- Aborta si la forma de los datos no es la esperada, en vez de tocar de más.
-- ============================================================

DO $$
DECLARE
  v_movement_id uuid;
  v_tx_id       uuid;
BEGIN
  SELECT m.id INTO v_movement_id
  FROM reserve_movements m
  JOIN reserve_accounts a ON a.id = m.reserve_id
  WHERE m.transaction_id IS NULL
    AND m.date = DATE '2025-03-04'
    AND m.amount = 1000000
    AND a.name = 'reinversión';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró el movimiento restaurado por la 048 (o ya fue corregido).';
  END IF;

  SELECT t.id INTO v_tx_id
  FROM transactions t
  WHERE t.voided_at IS NULL
    AND t.date = DATE '2026-03-04'
    AND t.amount = 1000000
    AND t.description = 'Transferencia → Reserva reinversión'
    AND NOT EXISTS (SELECT 1 FROM reserve_movements m2 WHERE m2.transaction_id = t.id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la transacción espejo sin reclamar del 2026-03-04.';
  END IF;

  UPDATE reserve_movements
  SET date = DATE '2026-03-04',
      transaction_id = v_tx_id,
      note = 'Restauración manual (mig. 048). Fecha corregida a 2026-03-04 y vinculada a su transacción en la mig. 079.'
  WHERE id = v_movement_id;
END $$;
