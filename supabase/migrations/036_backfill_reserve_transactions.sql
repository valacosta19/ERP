INSERT INTO transactions (date, type, amount, currency, description, category_id, catalog_item_id, is_seña, seña_amount, created_by)
SELECT
  rm.date,
  'transfer',
  ABS(rm.amount),
  'ARS',
  CASE WHEN rm.amount > 0
    THEN 'Transferencia → ' || ra.name
    ELSE 'Retorno ← ' || ra.name
  END,
  NULL,
  NULL,
  false,
  NULL,
  NULL
FROM reserve_movements rm
JOIN reserve_accounts ra ON ra.id = rm.reserve_id;
