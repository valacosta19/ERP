-- ============================================================
-- FIX DE SEGURIDAD: preview_inventory_recount quedó expuesta.
--
-- La función es SECURITY DEFINER, así que saltea RLS. En la 065 el chequeo
-- de rol se agregó solo a apply_inventory_recount, no a la de preview.
-- Postgres otorga EXECUTE a PUBLIC por defecto, así que cualquiera con la
-- anon key (que viaja pública en el bundle del frontend) podía llamarla y
-- leer nombres, SKUs, stock, costos unitarios y valor de inventario.
--
-- Verificado contra la base: una llamada sin autenticar devolvía datos reales.
--
-- Arreglo: mismo chequeo de admin que apply_, más REVOKE de PUBLIC/anon en
-- ambas funciones como defensa en profundidad.
-- ============================================================

CREATE OR REPLACE FUNCTION preview_inventory_recount(p_lines jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Solo un administrador puede previsualizar un recuento de inventario.';
  END IF;

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
  INTO v_result
  FROM rows_out;

  RETURN v_result;
END $$;

REVOKE EXECUTE ON FUNCTION preview_inventory_recount(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION apply_inventory_recount(uuid, date, jsonb, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION preview_inventory_recount(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION apply_inventory_recount(uuid, date, jsonb, uuid) TO authenticated;
