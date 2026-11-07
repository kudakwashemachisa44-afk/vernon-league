-- Applied 2026-11-07. Bans set by the admin (misconduct, league bans, longer red cards).
-- Red cards and yellow-card accumulation create bans automatically in the site; a 'red' row
-- for the same player and match overrides the automatic length.
create table if not exists suspensions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons on delete cascade,
  player_id uuid not null references players on delete cascade,
  team_id uuid not null references teams,
  fixture_id uuid references fixtures on delete set null,
  games int check (games is null or games between 0 and 50),   -- null = until further notice
  reason text not null default 'misconduct' check (reason in ('red','misconduct','ban','other')),
  note text,                                                      -- shown publicly
  created_at timestamptz not null default now()
);
create index if not exists suspensions_player_idx on suspensions (player_id);
alter table suspensions enable row level security;
create policy admin_all on suspensions for all to authenticated using (is_admin()) with check (is_admin());
create policy public_read on suspensions for select to anon, authenticated using (true);

-- Partner profile pages
alter table sponsors add column if not exists about text;
alter table sponsors add column if not exists role text;   -- one line per bullet
