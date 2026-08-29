-- ============================================================
-- Orden manual de las transacciones dentro de una misma fecha.
--
-- La lista de transacciones se ordena por date DESC y, dentro de cada día, por
-- orden de carga. Este orden interno no siempre es el que conviene leer, así
-- que la UI permite reordenar las filas de un mismo día arrastrándolas. El
-- orden por fecha no se toca: una fila nunca cambia de día.
--
-- POR QUÉ EN UNA TABLA APARTE Y NO EN UNA COLUMNA DE transactions:
-- trg_check_locked_period_update (mig. 033) es BEFORE UPDATE ON transactions
-- sin acotar columnas, así que rechaza cualquier UPDATE sobre una transacción
-- de un mes cerrado. Una columna position haría fallar el arrastre en esos
-- meses. Aquí el orden es presentación pura —no altera importes, fechas ni
-- categorías—, así que puede convivir con un período cerrado sin comprometer
-- el cierre contable, y los invariantes de transactions quedan intactos.
--
-- Solo tiene fila la transacción que pertenece a un día ya reordenado. Al
-- ordenar, la ausencia de posición equivale a 0: una transacción nueva en un
-- día ya reordenado aparece arriba de su grupo, que es el comportamiento
-- actual (más nueva primero).
-- ============================================================

CREATE TABLE transaction_display_order (
  transaction_id uuid PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
  position int NOT NULL
);

ALTER TABLE transaction_display_order ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_transaction_display_order" ON transaction_display_order
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
