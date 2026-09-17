-- 091: rubros de referencia para el peso de los gastos sobre los ingresos.
--
-- Los gastos fijos y las subcategorías de gasto tienen nombre libre, así que no
-- hay forma de inferir a qué rubro pertenecen. Cada uno se asigna a mano desde
-- Settings; un gasto sin rubro simplemente no muestra recomendación.
--
-- Los rangos son referencias generales del rubro peluquería/salón, editables
-- desde Settings. Fuentes de los defaults sembrados abajo:
--   personal   40-50%  joinblvd.com/blog/salon-budget-examples
--                      (40-60% si se cuentan cargas sociales)
--   ocupacion  10-15%  joinhomebase.com/blog/salon-monthly-expenses
--                      (occupancy cost ratio: alquiler + servicios + seguro)
--   insumos     8-12%  salonbizsoftware.com/blog/hair-salon-monthly-expenses
--   marketing   5-12%  promedio de servicios pequeños (11,8%), NO específico
--                      de peluquería — el más flojo de los cuatro.
-- Referencias agregadas, no asignables a un gasto individual:
--   gastos operativos totales 20-30% · utilidad neta 8-15% (mediana ~11%)

CREATE TABLE expense_benchmarks (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  min_pct numeric(5,2) NOT NULL,
  max_pct numeric(5,2) NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  CONSTRAINT expense_benchmarks_range CHECK (min_pct >= 0 AND max_pct >= min_pct AND max_pct <= 100)
);

ALTER TABLE expense_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read expense_benchmarks" ON expense_benchmarks FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated update expense_benchmarks" ON expense_benchmarks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON expense_benchmarks FROM anon;

INSERT INTO expense_benchmarks (key, label, description, min_pct, max_pct, sort_order) VALUES
  ('personal',  'Personal',   'Sueldos, comisiones y cargas sociales',            40, 50, 1),
  ('ocupacion', 'Ocupación',  'Alquiler, expensas, luz, gas, agua, seguro',       10, 15, 2),
  ('insumos',   'Insumos',    'Productos y materiales de uso profesional',         8, 12, 3),
  ('marketing', 'Marketing',  'Publicidad, redes y promociones',                   5, 12, 4);

ALTER TABLE fixed_costs ADD COLUMN benchmark_key text REFERENCES expense_benchmarks(key) ON DELETE SET NULL;
ALTER TABLE transaction_categories ADD COLUMN benchmark_key text REFERENCES expense_benchmarks(key) ON DELETE SET NULL;

CREATE INDEX idx_fixed_costs_benchmark_key ON fixed_costs(benchmark_key) WHERE benchmark_key IS NOT NULL;
CREATE INDEX idx_transaction_categories_benchmark_key ON transaction_categories(benchmark_key) WHERE benchmark_key IS NOT NULL;
