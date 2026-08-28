-- ============================================================
-- Cierra las cuatro inconsistencias de transaction_payments.
--
-- 1. 'Inventario' no es una cuenta. Era un centinela que escribía el flujo
--    viejo de gastos con descuento de inventario (commit 4694bcb, abril 2026)
--    para marcar "esto no se pagó con plata, salió del stock". Ese flujo se
--    retiró en junio y su reemplazo directamente no escribe fila de pago
--    (buildTicket.ts:139), pero las filas viejas quedaron. Se borran: la
--    transacción sigue siendo un gasto real y sigue restando en la utilidad,
--    lo que desaparece es una caja que nunca existió.
--
-- 2. Variantes de mayúsculas ('Efectivo'/'efectivo'). La app agrupa en
--    minúsculas y no muestra números erróneos, pero useReports.ts:198 agrupa
--    SIN minúsculas y sí parte las cuentas en dos. Se normaliza contra
--    payment_methods y se agrega una FK para que no vuelva a pasar.
--
-- 3. Importes. transaction_payments.amount era NUMERIC sin límite mientras
--    transactions.amount es NUMERIC(12,2) CHECK (amount > 0): el mismo importe
--    quedaba redondeado en la cabecera y con cuatro decimales en el detalle
--    (el costo FIFO por gramo se filtraba al pago). Se redondea y se le ponen
--    las mismas reglas.
--
-- 4. 'type' no tenía CHECK, y usePaymentMethodBalances trata como salida todo
--    lo que no sea exactamente 'entrada' — un typo restaba plata en silencio.
--
-- Además, cinco pagos de transacciones anuladas apuntaban a cuentas que no
-- existen ('.', 'SARAH', 'TG'): descripciones que cayeron en la columna
-- equivocada al importar. Se borran junto con los de 'Inventario'.
--
-- El orden importa: primero se borra lo que no es cuenta, después se normaliza,
-- y recién entonces se agregan las restricciones.
-- ============================================================

-- 1. Consumos y cortesías: el costo sale del stock, no de una caja.
DO $$
DECLARE v_deleted int;
BEGIN
  DELETE FROM transaction_payments WHERE lower(payment_method) = 'inventario';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Filas de pago "Inventario" eliminadas: %', v_deleted;
END $$;

-- 1b. Pagos de transacciones ANULADAS con cuentas que no existen ('.', 'SARAH',
--     'TG'): descripciones que se colaron en la columna de la cuenta al
--     importar. Una transacción anulada ya está excluida de todo saldo y de
--     todo reporte, así que borrar su fila de pago no mueve ningún número. La
--     transacción queda intacta, visible con su badge "Anulada".
DO $$
DECLARE v_deleted int;
BEGIN
  DELETE FROM transaction_payments p
  USING transactions t
  WHERE t.id = p.transaction_id
    AND t.voided_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM payment_methods pm WHERE lower(pm.name) = lower(p.payment_method)
    );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Filas de pago de transacciones anuladas con cuenta inexistente eliminadas: %', v_deleted;
END $$;

-- 2. Nombres de cuenta: unificar contra el catálogo.
UPDATE transaction_payments p
SET payment_method = pm.name
FROM payment_methods pm
WHERE lower(p.payment_method) = lower(pm.name)
  AND p.payment_method <> pm.name;

-- Un nombre que no exista en el catálogo bloquearía la FK. Abortar con el
-- detalle en vez de fallar con un error opaco de constraint.
DO $$
DECLARE v_huerfanos text;
BEGIN
  SELECT string_agg(DISTINCT p.payment_method, ', ')
  INTO v_huerfanos
  FROM transaction_payments p
  WHERE NOT EXISTS (SELECT 1 FROM payment_methods pm WHERE pm.name = p.payment_method);
  IF v_huerfanos IS NOT NULL THEN
    RAISE EXCEPTION 'Hay pagos con cuentas que no están en payment_methods: %. Crearlas en Ajustes o corregirlas antes de seguir.', v_huerfanos;
  END IF;
END $$;

-- 3. Importes: dos decimales, como en transactions.
UPDATE transaction_payments SET amount = round(amount, 2) WHERE amount <> round(amount, 2);

-- El signo va en 'type', nunca en el importe. Un negativo o un cero haría
-- fallar el CHECK de más abajo con un error opaco: cortar acá con el detalle.
DO $$
DECLARE v_malos int;
BEGIN
  SELECT count(*) INTO v_malos FROM transaction_payments WHERE amount <= 0;
  IF v_malos > 0 THEN
    RAISE EXCEPTION 'Hay % pagos con importe menor o igual a cero. Revisarlos antes de seguir: SELECT * FROM transaction_payments WHERE amount <= 0;', v_malos;
  END IF;
END $$;

-- Ídem para direcciones distintas de entrada/salida.
DO $$
DECLARE v_tipos text;
BEGIN
  SELECT string_agg(DISTINCT type, ', ') INTO v_tipos
  FROM transaction_payments WHERE type NOT IN ('entrada', 'salida');
  IF v_tipos IS NOT NULL THEN
    RAISE EXCEPTION 'Hay pagos con dirección inválida: %. Corregirlas antes de seguir.', v_tipos;
  END IF;
END $$;

-- ------------------------------------------------------------
-- Restricciones. Desde acá la base rechaza lo que antes aceptaba en silencio.
-- ------------------------------------------------------------

-- payment_methods.name pasa a ser único sin distinguir mayúsculas: si no, el
-- propio catálogo podría tener 'Efectivo' y 'efectivo' como dos cuentas.
CREATE UNIQUE INDEX IF NOT EXISTS payment_methods_name_lower_key
  ON payment_methods (lower(name));

-- FK con propagación: renombrar una cuenta en Ajustes actualiza sus pagos, y
-- no se puede borrar una cuenta que tenga pagos.
ALTER TABLE transaction_payments
  ADD CONSTRAINT transaction_payments_payment_method_fkey
  FOREIGN KEY (payment_method) REFERENCES payment_methods(name)
  ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE transaction_payments
  ALTER COLUMN amount TYPE numeric(12,2);

ALTER TABLE transaction_payments
  ADD CONSTRAINT transaction_payments_amount_positive CHECK (amount > 0);

ALTER TABLE transaction_payments
  ADD CONSTRAINT transaction_payments_type_check CHECK (type IN ('entrada', 'salida'));
