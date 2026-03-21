create table if not exists payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table payment_methods enable row level security;

create policy "Authenticated users can read payment_methods"
  on payment_methods for select
  to authenticated using (true);

create policy "Admins can manage payment_methods"
  on payment_methods for all
  to authenticated using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

insert into payment_methods (name) values
  ('Efectivo'),
  ('MP'),
  ('PPY'),
  ('Santander')
on conflict (name) do nothing;
