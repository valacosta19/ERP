create table user_action_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  action text not null,
  entity text not null,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz default now()
);

alter table user_action_logs enable row level security;

create policy "authenticated users can insert own logs"
  on user_action_logs
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "admins can select all logs"
  on user_action_logs
  for select
  to authenticated
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );
