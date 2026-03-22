DROP POLICY IF EXISTS "admin delete transaction_payments" ON transaction_payments;

CREATE POLICY "authenticated delete transaction_payments"
  ON transaction_payments FOR DELETE TO authenticated
  USING (true);
