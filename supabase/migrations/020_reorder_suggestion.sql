CREATE OR REPLACE FUNCTION suggest_reorder_quantity(
  p_product_id  uuid,
  p_order_month int,
  p_order_year  int
)
RETURNS TABLE (
  suggested_quantity numeric,
  avg_same_month     numeric,
  growth_rate        numeric,
  months_with_data   int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg_same_month   numeric := 0;
  v_months_with_data int     := 0;
  v_last_12m         numeric := 0;
  v_prev_12m         numeric := 0;
  v_growth_rate      numeric := 0;
  v_last_month_qty   numeric := 0;
BEGIN
  SELECT
    COALESCE(AVG(monthly_qty), 0),
    COUNT(*)::int
  INTO v_avg_same_month, v_months_with_data
  FROM (
    SELECT SUM(si.quantity) AS monthly_qty
    FROM sale_items si
    JOIN transactions t ON t.id = si.transaction_id
    WHERE si.product_id = p_product_id
      AND EXTRACT(MONTH FROM t.date) = p_order_month
      AND EXTRACT(YEAR  FROM t.date) < p_order_year
    GROUP BY EXTRACT(YEAR FROM t.date)
  ) history;

  IF v_months_with_data = 0 THEN
    SELECT COALESCE(SUM(si.quantity), 0)
    INTO v_last_month_qty
    FROM sale_items si
    JOIN transactions t ON t.id = si.transaction_id
    WHERE si.product_id = p_product_id
      AND t.date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
      AND t.date <  DATE_TRUNC('month', CURRENT_DATE);

    RETURN QUERY SELECT
      GREATEST(0, CEIL(v_last_month_qty))::numeric,
      ROUND(v_last_month_qty, 1),
      0::numeric,
      -1::int;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_last_12m
  FROM transactions
  WHERE type = 'income'
    AND date >= (CURRENT_DATE - INTERVAL '12 months')
    AND date <  CURRENT_DATE;

  SELECT COALESCE(SUM(amount), 0) INTO v_prev_12m
  FROM transactions
  WHERE type = 'income'
    AND date >= (CURRENT_DATE - INTERVAL '24 months')
    AND date <  (CURRENT_DATE - INTERVAL '12 months');

  IF v_prev_12m > 0 THEN
    v_growth_rate := GREATEST(-0.5, LEAST(1.0,
      (v_last_12m - v_prev_12m) / v_prev_12m
    ));
  END IF;

  RETURN QUERY SELECT
    GREATEST(0, CEIL(v_avg_same_month * (1 + v_growth_rate)))::numeric,
    ROUND(v_avg_same_month, 1),
    ROUND(v_growth_rate, 3),
    v_months_with_data;
END;
$$;
