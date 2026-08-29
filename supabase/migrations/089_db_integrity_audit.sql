-- ============================================================
-- Auditoría de integridad de la base (fase B).
--
-- Hoy todos los usuarios son admin, así que nada de esto cambia lo que ve la
-- app. Se cierra ahora porque el día que exista una cuenta employee estos
-- fallos son silenciosos: no dan error, dejan datos mal.
--
-- 1. Cierre de período ciego para no-admin. check_transaction_period_not_locked
--    (033) leía locked_periods bajo la RLS del usuario; como la única policy es
--    de admin, un employee no veía filas, el EXISTS daba falso y escribía en un
--    mes cerrado sin resistencia. Pasa a SECURITY DEFINER. Además revisa
--    OLD.date en UPDATE (antes se podía sacar una fila de un mes cerrado
--    cambiándole la fecha) y cubre DELETE.
-- 2. La policy de UPDATE de 030 (using true / with check true) dejaba a
--    cualquier autenticado reescribir importe, fecha y categoría de cualquier
--    transacción, anulando admin_transactions. Se reemplaza por una scoped a
--    las filas propias (created_by = auth.uid()); anular ya va por el RPC
--    void_transaction. Los DELETE de transaction_payments y
--    transaction_hairdressers quedan con el mismo criterio: filas de
--    transacciones propias o admin. Sin esto, editar la profesional de una
--    transacción como employee no borraba la fila anterior (0 filas, sin
--    error) y la comisión se duplicaba.
-- 3. RPCs SECURITY DEFINER alcanzables con la anon key: Postgres da EXECUTE a
--    PUBLIC por defecto y ningún GRANT posterior lo quita. Se revoca y se
--    concede solo a authenticated. Se pinea search_path en las tres que no lo
--    tenían y se elimina la sobrecarga vieja de receive_purchase_order(uuid,
--    uuid) que 022 dejó residente.
-- 4. Índices en las FKs y filtros más usados por la lista de transacciones,
--    comisiones, grupos y la reversión FIFO al anular.
-- 5. products_with_stock corre con security_invoker para respetar la RLS del
--    que consulta (las RPC SECURITY DEFINER siguen leyéndola como dueñas).
-- ============================================================

-- 1. Cierre de período -------------------------------------------------------

CREATE OR REPLACE FUNCTION period_is_locked(p_date date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM locked_periods
    WHERE year = EXTRACT(YEAR FROM p_date)::int
      AND month = EXTRACT(MONTH FROM p_date)::int
  );
$$;

REVOKE ALL ON FUNCTION period_is_locked(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION period_is_locked(date) TO authenticated;

CREATE OR REPLACE FUNCTION check_transaction_period_not_locked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND period_is_locked(OLD.date) THEN
    RAISE EXCEPTION 'El período %/% está cerrado y no puede modificarse.',
      EXTRACT(MONTH FROM OLD.date)::int, EXTRACT(YEAR FROM OLD.date)::int;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND period_is_locked(NEW.date) THEN
    RAISE EXCEPTION 'El período %/% está cerrado y no puede modificarse.',
      EXTRACT(MONTH FROM NEW.date)::int, EXTRACT(YEAR FROM NEW.date)::int;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_locked_period_delete ON transactions;
CREATE TRIGGER trg_check_locked_period_delete
  BEFORE DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION check_transaction_period_not_locked();

-- 2. Policies ----------------------------------------------------------------

DROP POLICY IF EXISTS "authenticated users can void transactions" ON transactions;
DROP POLICY IF EXISTS "transactions_update_own" ON transactions;
CREATE POLICY "transactions_update_own"
  ON transactions FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "authenticated delete transaction_payments" ON transaction_payments;
DROP POLICY IF EXISTS "own or admin delete transaction_payments" ON transaction_payments;
CREATE POLICY "own or admin delete transaction_payments"
  ON transaction_payments FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = transaction_payments.transaction_id
        AND (
          t.created_by = auth.uid()
          OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
        )
    )
  );

DROP POLICY IF EXISTS "admin delete transaction_hairdressers" ON transaction_hairdressers;
DROP POLICY IF EXISTS "own or admin delete transaction_hairdressers" ON transaction_hairdressers;
CREATE POLICY "own or admin delete transaction_hairdressers"
  ON transaction_hairdressers FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM transactions t
      WHERE t.id = transaction_hairdressers.transaction_id
        AND (
          t.created_by = auth.uid()
          OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
        )
    )
  );

-- 3. RPCs: alcance y search_path -------------------------------------------

DROP FUNCTION IF EXISTS receive_purchase_order(uuid, uuid);

REVOKE ALL ON FUNCTION consume_inventory_fifo(uuid, numeric, uuid, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION consume_inventory_fifo(uuid, numeric, uuid, numeric, uuid) TO authenticated;

REVOKE ALL ON FUNCTION create_sale(date, uuid, text, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_sale(date, uuid, text, uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION receive_purchase_order(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION receive_purchase_order(uuid, uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION create_staff_receivable(uuid, uuid, uuid, numeric, numeric, date, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_staff_receivable(uuid, uuid, uuid, numeric, numeric, date, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION create_staff_advance(uuid, uuid, numeric, text, text, date, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_staff_advance(uuid, uuid, numeric, text, text, date, uuid, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION suggest_reorder_quantity(uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION suggest_reorder_quantity(uuid, int, int) TO authenticated;
ALTER FUNCTION suggest_reorder_quantity(uuid, int, int) SET search_path = public;

REVOKE ALL ON FUNCTION create_funnel_unit(uuid, date, text, text, uuid, text, uuid, text, text, jsonb, jsonb, uuid, numeric, numeric, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_funnel_unit(uuid, date, text, text, uuid, text, uuid, text, text, jsonb, jsonb, uuid, numeric, numeric, numeric, uuid) TO authenticated;
ALTER FUNCTION create_funnel_unit(uuid, date, text, text, uuid, text, uuid, text, text, jsonb, jsonb, uuid, numeric, numeric, numeric, uuid) SET search_path = public;

ALTER FUNCTION get_opening_balance(date, text, text) SET search_path = public;

-- 4. Índices -----------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_transaction_payments_transaction ON transaction_payments (transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_hairdressers_transaction ON transaction_hairdressers (transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_active ON transactions (date DESC) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transaction_group_members_transaction ON transaction_group_members (transaction_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_lot ON inventory_movements (lot_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_reference ON inventory_movements (reference_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_lot ON sale_items (lot_id);
CREATE INDEX IF NOT EXISTS idx_receivable_collections_receivable ON receivable_collections (receivable_id);
CREATE INDEX IF NOT EXISTS idx_supplier_debt_payments_debt ON supplier_debt_payments (debt_id);

-- 5. Vista -------------------------------------------------------------------

ALTER VIEW products_with_stock SET (security_invoker = true);
