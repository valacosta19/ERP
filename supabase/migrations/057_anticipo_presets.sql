create table if not exists anticipo_presets (
  id uuid primary key default gen_random_uuid(),
  amount numeric not null,
  created_at timestamptz not null default now()
);

alter table anticipo_presets enable row level security;

create policy "Authenticated users can read anticipo_presets"
  on anticipo_presets for select
  to authenticated using (true);

create policy "Admins can manage anticipo_presets"
  on anticipo_presets for all
  to authenticated using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

insert into anticipo_presets (amount) values
  (5000),
  (10000),
  (20000);
