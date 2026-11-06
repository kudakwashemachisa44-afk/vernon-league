-- Applied 2026-11-06. Yellow and red cards per match; public can read, only admins write.
create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references fixtures on delete cascade,
  team_id uuid not null references teams,
  player_id uuid references players on delete set null,
  color text not null check (color in ('yellow','red')),
  created_at timestamptz not null default now()
);
create index if not exists cards_fixture_idx on cards (fixture_id);
alter table cards enable row level security;
create policy admin_all on cards for all to authenticated using (is_admin()) with check (is_admin());
create policy public_read on cards for select to anon, authenticated using (true);
