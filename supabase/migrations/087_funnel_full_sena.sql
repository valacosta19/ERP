-- 087: permitir amount = 0 cuando el servicio quedó cubierto por la seña.
--
-- transactions.amount lleva CHECK (amount > 0) desde 001. La Carga Rápida
-- permite imputar un anticipo previo que cubre el precio completo del servicio
-- ("Cubierto por el anticipo — se marca pagado sin cobrar"): la unidad llega a
-- create_funnel_unit sin pagos, v_amount queda en 0 y el INSERT era rechazado.
--
-- El modelo contable ya contempla el caso: el total del servicio es
-- amount + seña_amount en todos los reportes (Financiero, Comisiones, Utilidad,
-- snapshot del widget). Un servicio con amount = 0 y seña_amount > 0 se cuenta
-- por su precio completo vía la seña. Solo se admite el cero en esa combinación:
-- cualquier otra transacción sigue exigiendo un importe positivo.

ALTER TABLE transactions DROP CONSTRAINT transactions_amount_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_amount_check
  CHECK (amount > 0 OR (amount = 0 AND seña_amount > 0));
