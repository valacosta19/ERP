DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'transactions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%income%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE transactions DROP CONSTRAINT ' || quote_ident(constraint_name);
  END IF;
END $$;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('income', 'expense', 'transfer'));
