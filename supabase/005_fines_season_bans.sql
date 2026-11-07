-- Applied 2026-11-07. Red-card fines ($50 by default, set in config.js) and longer ban reasons.
-- The site creates red-card fines automatically from the match sheet (red, or 2 yellows in one game);
-- a 'red' row here for the same player and match records its status (paid / waived) or a different amount.
alter table suspensions drop constraint if exists suspensions_reason_check;
alter table suspensions add constraint suspensions_reason_check check (reason in ('red','misconduct','altercation','ban','season','other'));

create table if not exists fines (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons on delete cascade,
  player_id uuid not null references players on delete cascade,
  team_id uuid not null references teams,
  fixture_id uuid references fixtures on delete set null,
  amount numeric(6,2) not null default 50 check (amount >= 0),
  reason text not null default 'red' check (reason in ('red','misconduct','other')),
  status text not null default 'unpaid' check (status in ('unpaid','paid','waived')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists fines_player_idx on fines (player_id);
alter table fines enable row level security;
create policy admin_all on fines for all to authenticated using (is_admin()) with check (is_admin());
create policy public_read on fines for select to anon, authenticated using (true);
