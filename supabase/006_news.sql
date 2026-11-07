-- Applied 2026-11-07. Admin-posted news. Results, hat-tricks, form, bans and postponements are generated in the site.
create table if not exists news (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons on delete cascade,
  team_id uuid references teams on delete set null,
  kind text not null default 'league' check (kind in ('league','team','sponsor','schedule')),
  title text not null check (length(title) between 3 and 120),
  body text check (length(body) <= 1000),
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists news_season_idx on news (season_id, created_at desc);
alter table news enable row level security;
create policy admin_all on news for all to authenticated using (is_admin()) with check (is_admin());
create policy public_read on news for select to anon, authenticated using (true);
