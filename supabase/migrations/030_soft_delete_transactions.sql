alter table transactions
  add column voided_at timestamptz,
  add column voided_by uuid references auth.users(id);

create policy "authenticated users can void transactions"
  on transactions
  for update
  to authenticated
  using (true)
  with check (true);
