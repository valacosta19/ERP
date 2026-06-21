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
  v_avg_same_month    numeric := 0;
  v_months_with_data  int     := 0;
  v_growth_rate       numeric := 0;
  v_last_12m          numeric := 0;
  v_prev_12m          numeric := 0;
  v_recent_avg        numeric := 0;
  v_last_3m_income    numeric := 0;
  v_prev_3m_income    numeric := 0;
  v_short_term_growth numeric := 0;
BEGIN
  -- Tier 1: prior-year same-month demand from all outflows (sales + consumptions + staff withdrawals)
  SELECT
    COALESCE(AVG(monthly_qty), 0),
    COUNT(*)::int
  INTO v_avg_same_month, v_months_with_data
  FROM (
    SELECT SUM(im.quantity) AS monthly_qty
    FROM inventory_movements im
    WHERE im.product_id = p_product_id
      AND im.movement_type = 'out'
      AND EXTRACT(MONTH FROM im.created_at) = p_order_month
      AND EXTRACT(YEAR  FROM im.created_at) < p_order_year
    GROUP BY EXTRACT(YEAR FROM im.created_at)
  ) history;

  IF v_months_with_data > 0 THEN
    SELECT COALESCE(SUM(t.amount), 0)
    INTO v_last_12m
    FROM transactions t
    JOIN transaction_categories tc ON tc.id = t.subcategory_id
    WHERE tc.transaction_type = 'income'
      AND t.voided_at IS NULL
      AND t.is_seña = false
      AND t.date >= (CURRENT_DATE - INTERVAL '12 months')
      AND t.date <   CURRENT_DATE;

    SELECT COALESCE(SUM(t.amount), 0)
    INTO v_prev_12m
    FROM transactions t
    JOIN transaction_categories tc ON tc.id = t.subcategory_id
    WHERE tc.transaction_type = 'income'
      AND t.voided_at IS NULL
      AND t.is_seña = false
      AND t.date >= (CURRENT_DATE - INTERVAL '24 months')
      AND t.date <  (CURRENT_DATE - INTERVAL '12 months');

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
    RETURN;
  END IF;

  -- Tier 2: no prior-year same-month data — use average of last 3 complete months
  SELECT COALESCE(AVG(monthly_qty), 0)
  INTO v_recent_avg
  FROM (
    SELECT SUM(im.quantity) AS monthly_qty
    FROM inventory_movements im
    WHERE im.product_id = p_product_id
      AND im.movement_type = 'out'
      AND im.created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '3 months')
      AND im.created_at <  DATE_TRUNC('month', CURRENT_DATE)
    GROUP BY DATE_TRUNC('month', im.created_at)
  ) recent;

  IF v_recent_avg > 0 THEN
    SELECT COALESCE(SUM(t.amount), 0)
    INTO v_last_3m_income
    FROM transactions t
    JOIN transaction_categories tc ON tc.id = t.subcategory_id
    WHERE tc.transaction_type = 'income'
      AND t.voided_at IS NULL
      AND t.is_seña = false
      AND t.date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '3 months')
      AND t.date <  DATE_TRUNC('month', CURRENT_DATE);

    SELECT COALESCE(SUM(t.amount), 0)
    INTO v_prev_3m_income
    FROM transactions t
    JOIN transaction_categories tc ON tc.id = t.subcategory_id
    WHERE tc.transaction_type = 'income'
      AND t.voided_at IS NULL
      AND t.is_seña = false
      AND t.date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '6 months')
      AND t.date <  DATE_TRUNC('month', CURRENT_DATE - INTERVAL '3 months');

    IF v_prev_3m_income > 0 THEN
      v_short_term_growth := GREATEST(-0.3, LEAST(0.5,
        (v_last_3m_income - v_prev_3m_income) / v_prev_3m_income
      ));
    END IF;

    RETURN QUERY SELECT
      GREATEST(0, CEIL(v_recent_avg * (1 + v_short_term_growth)))::numeric,
      ROUND(v_recent_avg, 1),
      ROUND(v_short_term_growth, 3),
      -1::int;
    RETURN;
  END IF;

  -- Tier 3: no outflow data at all
  RETURN QUERY SELECT 0::numeric, 0::numeric, 0::numeric, 0::int;
END;
$$;
