-- ============================================================
-- ERP Peluquería — Schema Inicial
-- ============================================================

-- Profiles (extiende auth.users)
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  role        TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Categories
CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(name, type)
);

-- Transactions
CREATE TABLE transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date        DATE NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  category_id UUID REFERENCES categories(id),
  description TEXT,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Suppliers
CREATE TABLE suppliers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  contact     TEXT,
  phone       TEXT,
  email       TEXT,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Products
CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  sku         TEXT NOT NULL UNIQUE,
  unit        TEXT,
  sale_price  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  min_stock   NUMERIC(12, 3) NOT NULL DEFAULT 0,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Purchase Orders
CREATE TABLE purchase_orders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES suppliers(id),
  order_date  DATE NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'received', 'cancelled')),
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Purchase Order Items
CREATE TABLE purchase_order_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id   UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id          UUID NOT NULL REFERENCES products(id),
  quantity            NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  unit_cost           NUMERIC(12, 4) NOT NULL CHECK (unit_cost >= 0),
  lot_id              UUID
);

-- Inventory Lots
CREATE TABLE inventory_lots (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id                UUID NOT NULL REFERENCES products(id),
  purchase_order_item_id    UUID REFERENCES purchase_order_items(id),
  received_date             DATE NOT NULL,
  initial_quantity          NUMERIC(12, 3) NOT NULL CHECK (initial_quantity > 0),
  remaining_quantity        NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (remaining_quantity >= 0),
  unit_cost                 NUMERIC(12, 4) NOT NULL CHECK (unit_cost >= 0),
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK from purchase_order_items to inventory_lots
ALTER TABLE purchase_order_items
  ADD CONSTRAINT fk_lot FOREIGN KEY (lot_id) REFERENCES inventory_lots(id);

-- Inventory Movements (append-only audit log)
CREATE TABLE inventory_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id          UUID REFERENCES inventory_lots(id),
  product_id      UUID NOT NULL REFERENCES products(id),
  movement_type   TEXT NOT NULL CHECK (movement_type IN ('in', 'out', 'adjustment')),
  quantity        NUMERIC(12, 3) NOT NULL,
  unit_cost       NUMERIC(12, 4),
  reference_type  TEXT,
  reference_id    UUID,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sale Items
CREATE TABLE sale_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  lot_id          UUID NOT NULL REFERENCES inventory_lots(id),
  quantity        NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  unit_cost       NUMERIC(12, 4) NOT NULL,
  unit_sale_price NUMERIC(12, 2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Índices
-- ============================================================
CREATE INDEX idx_transactions_date       ON transactions(date DESC);
CREATE INDEX idx_transactions_type       ON transactions(type);
CREATE INDEX idx_transactions_category   ON transactions(category_id);
CREATE INDEX idx_lots_fifo               ON inventory_lots(product_id, received_date ASC) WHERE remaining_quantity > 0;
CREATE INDEX idx_movements_product       ON inventory_movements(product_id, created_at DESC);
CREATE INDEX idx_sale_items_transaction  ON sale_items(transaction_id);
CREATE INDEX idx_sale_items_product      ON sale_items(product_id);
CREATE INDEX idx_po_status               ON purchase_orders(status);

-- ============================================================
-- FIFO RPC
-- ============================================================
CREATE OR REPLACE FUNCTION consume_inventory_fifo(
  p_product_id      UUID,
  p_quantity        NUMERIC,
  p_transaction_id  UUID,
  p_unit_sale_price NUMERIC,
  p_created_by      UUID
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  lot           RECORD;
  qty_needed    NUMERIC := p_quantity;
  qty_to_take   NUMERIC;
BEGIN
  FOR lot IN
    SELECT id, remaining_quantity, unit_cost
    FROM inventory_lots
    WHERE product_id = p_product_id AND remaining_quantity > 0
    ORDER BY received_date ASC
    FOR UPDATE
  LOOP
    EXIT WHEN qty_needed <= 0;

    qty_to_take := LEAST(lot.remaining_quantity, qty_needed);

    UPDATE inventory_lots
    SET remaining_quantity = remaining_quantity - qty_to_take
    WHERE id = lot.id;

    INSERT INTO sale_items (transaction_id, product_id, lot_id, quantity, unit_cost, unit_sale_price)
    VALUES (p_transaction_id, p_product_id, lot.id, qty_to_take, lot.unit_cost, p_unit_sale_price);

    INSERT INTO inventory_movements (lot_id, product_id, movement_type, quantity, unit_cost, reference_type, reference_id, created_by)
    VALUES (lot.id, p_product_id, 'out', qty_to_take, lot.unit_cost, 'transaction', p_transaction_id, p_created_by);

    qty_needed := qty_needed - qty_to_take;
  END LOOP;

  IF qty_needed > 0 THEN
    RAISE EXCEPTION 'Stock insuficiente para el producto %. Faltan % unidades.', p_product_id, qty_needed;
  END IF;
END;
$$;

-- ============================================================
-- Trigger: crear profile automáticamente al registrarse
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', 'employee');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_lots      ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items          ENABLE ROW LEVEL SECURITY;

-- Profiles: cada usuario ve/edita el suyo; admin ve todos
CREATE POLICY "profiles_select" ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Lectura universal para autenticados
CREATE POLICY "categories_select"   ON categories          FOR SELECT TO authenticated USING (true);
CREATE POLICY "suppliers_select"    ON suppliers           FOR SELECT TO authenticated USING (true);
CREATE POLICY "products_select"     ON products            FOR SELECT TO authenticated USING (true);
CREATE POLICY "po_select"           ON purchase_orders     FOR SELECT TO authenticated USING (true);
CREATE POLICY "po_items_select"     ON purchase_order_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "lots_select"         ON inventory_lots      FOR SELECT TO authenticated USING (true);
CREATE POLICY "movements_select"    ON inventory_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "sale_items_select"   ON sale_items          FOR SELECT TO authenticated USING (true);
CREATE POLICY "transactions_select" ON transactions        FOR SELECT TO authenticated USING (true);

-- Empleados: insertar sus propias transacciones
CREATE POLICY "transactions_insert" ON transactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Admin: gestión completa
CREATE POLICY "admin_categories"    ON categories           FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');
CREATE POLICY "admin_suppliers"     ON suppliers            FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');
CREATE POLICY "admin_products"      ON products             FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');
CREATE POLICY "admin_po"            ON purchase_orders      FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');
CREATE POLICY "admin_po_items"      ON purchase_order_items FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');
CREATE POLICY "admin_lots"          ON inventory_lots       FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');
CREATE POLICY "admin_movements"     ON inventory_movements  FOR INSERT TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');
CREATE POLICY "admin_transactions"  ON transactions         FOR ALL TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');
