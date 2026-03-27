DELETE FROM transactions
WHERE type IN ('income', 'expense')
  AND (
    description LIKE 'Transferencia → %'
    OR description LIKE 'Retorno ← %'
  );
