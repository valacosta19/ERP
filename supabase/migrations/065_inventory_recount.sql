-- ============================================================
-- Recuento físico de inventario (cierre y apertura con fecha)
--
-- Pone el stock del sistema a la par del físico SIN borrar nada:
--   1. Cada lote con stock se lleva a cero, con un movimiento
--      'adjustment' por lote (invariante "inventory movements always").
--   2. Se abre un lote nuevo con lo contado, fechado en el corte.
--
-- NO crea filas en transactions: la pérdida de valor impacta solo
-- inventario, no la utilidad del mes. Coherente con create_staff_receivable.
-- NUNCA toca unit_cost de los lotes viejos (está bloqueado cuando el lote
-- tiene ventas), así que el costo histórico de cada venta queda intacto.
-- ============================================================

CREATE TABLE IF NOT EXISTS inventory_recounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cutoff_date date NOT NULL,
  client_uuid uuid NOT NULL UNIQUE,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_recounts_cutoff
  ON inventory_recounts(cutoff_date DESC);

ALTER TABLE inventory_recounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_inventory_recounts" ON inventory_recounts
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admin_all_inventory_recounts" ON inventory_recounts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'));

-- ------------------------------------------------------------
-- Vista previa (dry run). Solo lectura: no escribe nada.
-- p_lines: [{ "product_id": uuid, "quantity": numeric, "unit_cost": numeric }]
-- Los productos sin contar NO se incluyen en p_lines y quedan intactos;
-- los totales de valor se refieren únicamente a los productos contados.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION preview_inventory_recount(p_lines jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH lines AS (
  SELECT (l->>'product_id')::uuid  AS product_id,
         (l->>'quantity')::numeric AS counted_quantity,
         (l->>'unit_cost')::numeric AS unit_cost
  FROM jsonb_array_elements(p_lines) AS l
),
stock AS (
  SELECT ln.product_id,
         ln.counted_quantity,
         ln.unit_cost,
         COALESCE(SUM(il.remaining_quantity), 0)                 AS system_quantity,
         COALESCE(SUM(il.remaining_quantity * il.unit_cost), 0)  AS value_before
  FROM lines ln
  LEFT JOIN inventory_lots il
    ON il.product_id = ln.product_id AND il.remaining_quantity > 0
  GROUP BY ln.product_id, ln.counted_quantity, ln.unit_cost
),
rows_out AS (
  SELECT s.product_id,
         p.name AS product_name,
         p.sku,
         s.system_quantity,
         s.counted_quantity,
         s.counted_quantity - s.system_quantity AS delta_quantity,
         s.unit_cost,
         s.value_before,
         s.counted_quantity * s.unit_cost AS value_after
  FROM stock s
  JOIN products p ON p.id = s.product_id
)
SELECT jsonb_build_object(
  'lines', COALESCE(jsonb_agg(jsonb_build_object(
      'product_id',       product_id,
      'product_name',     product_name,
      'sku',              sku,
      'system_quantity',  system_quantity,
      'counted_quantity', counted_quantity,
      'delta_quantity',   delta_quantity,
      'unit_cost',        unit_cost,
      'value_before',     value_before,
      'value_after',      value_after,
      'delta_value',      value_after - value_before
    ) ORDER BY abs(value_after - value_before) DESC), '[]'::jsonb),
  'totals', jsonb_build_object(
      'contados',      COUNT(*),
      'omitidos',      (SELECT COUNT(*) FROM products WHERE deleted_at IS NULL) - COUNT(*),
      'valor_antes',   COALESCE(SUM(value_before), 0),
      'valor_despues', COALESCE(SUM(value_after), 0),
      'delta_valor',   COALESCE(SUM(value_after - value_before), 0),
      'faltantes',     COUNT(*) FILTER (WHERE delta_quantity < 0),
      'sobrantes',     COUNT(*) FILTER (WHERE delta_quantity > 0)
  )
)
FROM rows_out;
$$;

-- ------------------------------------------------------------
-- Aplicar el recuento. Atómica e idempotente por client_uuid.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION apply_inventory_recount(
  p_client_uuid  uuid,
  p_cutoff_date  date,
  p_lines        jsonb,
  p_created_by   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recount_id  uuid;
  v_new_lot_id  uuid;
  v_line        record;
  v_lot         record;
  v_totals      jsonb;
  v_reason      text;
BEGIN
  -- SECURITY DEFINER saltea RLS, así que el rol se valida acá a mano.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Solo un administrador puede aplicar un recuento de inventario.';
  END IF;

  SELECT id, totals INTO v_recount_id, v_totals
  FROM inventory_recounts WHERE client_uuid = p_client_uuid;

  IF v_recount_id IS NOT NULL THEN
    RETURN jsonb_build_object('recount_id', v_recount_id, 'totals', v_totals, 'already_applied', true);
  END IF;

  IF EXISTS (
    SELECT 1 FROM locked_periods
    WHERE year  = EXTRACT(YEAR  FROM p_cutoff_date)::int
      AND month = EXTRACT(MONTH FROM p_cutoff_date)::int
  ) THEN
    RAISE EXCEPTION 'El período % está cerrado. Elegí una fecha de corte en un mes abierto.',
      to_char(p_cutoff_date, 'MM/YYYY');
  END IF;

  v_totals := preview_inventory_recount(p_lines) -> 'totals';
  v_reason := 'Recuento físico ' || to_char(p_cutoff_date, 'DD/MM/YYYY');

  BEGIN
    INSERT INTO inventory_recounts (cutoff_date, client_uuid, created_by, totals)
    VALUES (p_cutoff_date, p_client_uuid, p_created_by, v_totals)
    RETURNING id INTO v_recount_id;
  EXCEPTION WHEN unique_violation THEN
    -- Otro request con el mismo client_uuid entró en paralelo: devolvemos el suyo.
    SELECT id, totals INTO v_recount_id, v_totals
    FROM inventory_recounts WHERE client_uuid = p_client_uuid;
    RETURN jsonb_build_object('recount_id', v_recount_id, 'totals', v_totals, 'already_applied', true);
  END;

  FOR v_line IN
    SELECT (l->>'product_id')::uuid   AS product_id,
           (l->>'quantity')::numeric  AS quantity,
           (l->>'unit_cost')::numeric AS unit_cost
    FROM jsonb_array_elements(p_lines) AS l
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM products WHERE id = v_line.product_id AND deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Producto no encontrado o archivado: %', v_line.product_id;
    END IF;

    IF v_line.quantity IS NULL OR v_line.quantity < 0 THEN
      RAISE EXCEPTION 'Cantidad inválida para el producto %: %', v_line.product_id, v_line.quantity;
    END IF;

    IF v_line.quantity > 0 AND (v_line.unit_cost IS NULL OR v_line.unit_cost < 0) THEN
      RAISE EXCEPTION 'Costo inválido para el producto %: %', v_line.product_id, v_line.unit_cost;
    END IF;

    -- 1. Bajar a cero los lotes actuales, un movimiento de ajuste por lote.
    FOR v_lot IN
      SELECT id, remaining_quantity, unit_cost
      FROM inventory_lots
      WHERE product_id = v_line.product_id AND remaining_quantity > 0
      ORDER BY received_date ASC
      FOR UPDATE
    LOOP
      INSERT INTO inventory_movements (
        lot_id, product_id, movement_type, quantity, unit_cost,
        reference_type, reference_id, created_by, reason
      ) VALUES (
        v_lot.id, v_line.product_id, 'adjustment', -v_lot.remaining_quantity, v_lot.unit_cost,
        'inventory_recount', v_recount_id, p_created_by, v_reason
      );

      UPDATE inventory_lots SET remaining_quantity = 0 WHERE id = v_lot.id;
    END LOOP;

    -- 2. Abrir el lote nuevo con lo contado.
    IF v_line.quantity > 0 THEN
      INSERT INTO inventory_lots (
        product_id, received_date, initial_quantity, remaining_quantity, unit_cost, notes
      ) VALUES (
        v_line.product_id, p_cutoff_date, v_line.quantity, v_line.quantity, v_line.unit_cost,
        'Lote de apertura por recuento físico ' || to_char(p_cutoff_date, 'DD/MM/YYYY')
      )
      RETURNING id INTO v_new_lot_id;

      INSERT INTO inventory_movements (
        lot_id, product_id, movement_type, quantity, unit_cost,
        reference_type, reference_id, created_by, reason
      ) VALUES (
        v_new_lot_id, v_line.product_id, 'in', v_line.quantity, v_line.unit_cost,
        'inventory_recount', v_recount_id, p_created_by, v_reason
      );
    END IF;
  END LOOP;

  INSERT INTO user_action_logs (user_id, action, entity, entity_id, metadata)
  VALUES (p_created_by, 'inventory_recount_applied', 'inventory_recounts', v_recount_id,
          v_totals || jsonb_build_object('cutoff_date', p_cutoff_date));

  RETURN jsonb_build_object('recount_id', v_recount_id, 'totals', v_totals, 'already_applied', false);
END $$;
