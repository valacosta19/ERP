-- ============================================================
-- Agrupación de transacciones para conciliación bancaria.
--
-- Un mismo cobro real llega partido en varias transacciones: el cliente hace
-- UNA transferencia que cubre un servicio y la compra de un producto, y cada
-- concepto se carga por separado porque cada uno necesita su categoría, su
-- comisión y su descuento de inventario. Al conciliar contra el extracto no
-- hay ninguna fila que muestre el importe que efectivamente entró.
--
-- Estas dos tablas etiquetan un conjunto de transacciones para que la lista
-- las muestre como una sola fila con el total. Es PRESENTACIONAL: ningún
-- reporte, balance, snapshot ni RPC las lee. No se crea ninguna transacción
-- "resumen" — eso duplicaría el importe en todos los agregadores.
--
-- POR QUÉ UNA TABLA DE UNIÓN Y NO UNA COLUMNA EN transactions: la 033 pone
-- check_transaction_period_not_locked() como BEFORE UPDATE sin filtro de
-- columnas sobre transactions. Un group_id en la tabla obligaría a un UPDATE
-- para agrupar, y ese trigger lo rechazaría en cualquier mes cerrado — justo
-- el caso de conciliar una transferencia vieja. Con la tabla de membresía,
-- agrupar es un INSERT que no toca transactions y no necesita abrir el
-- período. Además la 076 fijó que el vínculo lo lleva siempre la fila de
-- dominio, nunca transactions.
-- ============================================================

CREATE TABLE IF NOT EXISTS transaction_groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label      text NOT NULL,
  currency   text NOT NULL CHECK (currency IN ('ARS', 'USD', 'EUR')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS transaction_group_members (
  group_id       uuid NOT NULL REFERENCES transaction_groups(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_transaction_group_members_group
  ON transaction_group_members(group_id);

-- Un total en monedas mezcladas no significa nada. Es la única invariante que
-- no puede quedar sólo en la UI.
CREATE OR REPLACE FUNCTION check_group_member_currency()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tx_currency    text;
  v_group_currency text;
BEGIN
  SELECT currency INTO v_tx_currency    FROM transactions      WHERE id = NEW.transaction_id;
  SELECT currency INTO v_group_currency FROM transaction_groups WHERE id = NEW.group_id;

  IF v_tx_currency IS DISTINCT FROM v_group_currency THEN
    RAISE EXCEPTION 'La transacción está en % y el grupo en %: un grupo no puede mezclar monedas.',
      v_tx_currency, v_group_currency;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_group_member_currency ON transaction_group_members;
CREATE TRIGGER trg_check_group_member_currency
  BEFORE INSERT ON transaction_group_members
  FOR EACH ROW EXECUTE FUNCTION check_group_member_currency();

ALTER TABLE transaction_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read transaction_groups"   ON transaction_groups;
DROP POLICY IF EXISTS "authenticated insert transaction_groups" ON transaction_groups;
DROP POLICY IF EXISTS "authenticated delete transaction_groups" ON transaction_groups;

CREATE POLICY "authenticated read transaction_groups"
  ON transaction_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert transaction_groups"
  ON transaction_groups FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated delete transaction_groups"
  ON transaction_groups FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated read transaction_group_members"   ON transaction_group_members;
DROP POLICY IF EXISTS "authenticated insert transaction_group_members" ON transaction_group_members;
DROP POLICY IF EXISTS "authenticated delete transaction_group_members" ON transaction_group_members;

CREATE POLICY "authenticated read transaction_group_members"
  ON transaction_group_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated insert transaction_group_members"
  ON transaction_group_members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "authenticated delete transaction_group_members"
  ON transaction_group_members FOR DELETE TO authenticated USING (true);
