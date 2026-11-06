-- League Hub database (Supabase / Postgres)
-- Multi-league from day one: every row hangs off a league -> season.
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.

create extension if not exists pgcrypto;

-- ---------- core tables ----------
create table leagues (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  venue text,
  created_at timestamptz not null default now()
);

create table seasons (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references leagues on delete cascade,
  name text not null,
  starts_on date,
  ends_on date,
  is_current boolean not null default true,
  points_win int not null default 3,
  points_draw int not null default 1
);

create table teams (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons on delete cascade,
  slug text not null,
  name text not null,
  short_name text not null,
  color_primary text,
  color_secondary text,
  colors_confirmed boolean not null default false,
  formation text not null default '2-4-1',
  rep_name text,
  rep_email text,
  unique (season_id, slug)
);

-- Secret captain links live apart from teams so they are never public.
create table team_tokens (
  team_id uuid primary key references teams on delete cascade,
  token uuid not null unique default gen_random_uuid()
);

create table players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams on delete cascade,
  display_name text not null,
  position text check (position in ('GK','DEF','MID','FWD')),
  lineup_slot text check (lineup_slot in ('GK','LCB','RCB','LW','LCM','RCM','RW','ST')),
  public_ok boolean not null default true,   -- player can hide name and stats
  photo_ok boolean not null default false,   -- photos only with consent
  active boolean not null default true,
  sort int not null default 0
);

create table fixtures (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons on delete cascade,
  code text not null,                         -- e.g. w4-2
  week int,
  stage text not null default 'regular' check (stage in ('regular','P1','P2','final')),
  kickoff timestamptz not null,
  home_team_id uuid references teams,
  away_team_id uuid references teams,
  status text not null default 'scheduled' check (status in ('scheduled','final','postponed')),
  home_goals int check (home_goals >= 0),
  away_goals int check (away_goals >= 0),
  unique (season_id, code)
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references fixtures on delete cascade,
  team_id uuid not null references teams,
  home_goals int not null check (home_goals between 0 and 30),
  away_goals int not null check (away_goals between 0 and 30),
  goals jsonb not null default '[]',          -- [{"scorer": uuid|null, "assist": uuid|null}]
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references fixtures on delete cascade,
  team_id uuid not null references teams,
  scorer_id uuid references players on delete set null,
  assist_id uuid references players on delete set null,
  submission_id uuid references submissions on delete cascade
);

create table sponsors (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons on delete cascade,
  name text not null,
  tier text not null default 'supporter' check (tier in ('headline','matchday','supporter')),
  logo_url text,
  link_url text,
  sort int not null default 0
);

create table media (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid references fixtures on delete cascade,
  kind text not null check (kind in ('photo','highlight')),
  url text not null,
  caption text,
  created_at timestamptz not null default now()
);

create table admins (
  user_id uuid primary key references auth.users on delete cascade
);

create index on fixtures (season_id, kickoff);
create index on goals (fixture_id);
create index on submissions (status);
create index on players (team_id);

-- ---------- helpers ----------
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;

-- ---------- row level security ----------
do $$
declare t text;
begin
  foreach t in array array['leagues','seasons','teams','team_tokens','players','fixtures','submissions','goals','sponsors','media','admins'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy admin_all on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
  -- public read for non-sensitive tables (players are read through public_players)
  foreach t in array array['leagues','seasons','teams','fixtures','goals','sponsors','media'] loop
    execute format('create policy public_read on %I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- ---------- public views ----------
-- Hidden players appear with a null name; their goals still count.
create view public_players as
  select id, team_id, case when public_ok then display_name end as name,
         position, lineup_slot, active, sort
  from players;

create view standings as
with res as (
  select season_id, home_team_id as team_id, home_goals as gf, away_goals as ga
  from fixtures where status = 'final' and stage = 'regular'
  union all
  select season_id, away_team_id, away_goals, home_goals
  from fixtures where status = 'final' and stage = 'regular'
)
select t.season_id, t.id as team_id, t.slug, t.name, t.short_name,
  count(r.team_id)                          as gp,
  count(*) filter (where r.gf > r.ga)       as w,
  count(*) filter (where r.gf = r.ga)       as d,
  count(*) filter (where r.gf < r.ga)       as l,
  coalesce(sum(r.gf), 0)                    as gf,
  coalesce(sum(r.ga), 0)                    as ga,
  coalesce(sum(r.gf - r.ga), 0)             as gd,
  coalesce(sum(case when r.gf > r.ga then s.points_win
                    when r.gf = r.ga then s.points_draw else 0 end), 0) as pts
from teams t
join seasons s on s.id = t.season_id
left join res r on r.team_id = t.id
group by t.season_id, t.id, t.slug, t.name, t.short_name;
-- Head-to-head is the last tiebreaker; the site applies it when sorting.

create view leaders as
select p.team_id, p.id as player_id,
       case when p.public_ok then p.display_name end as name,
       (select count(*) from goals g join fixtures f on f.id = g.fixture_id
         where g.scorer_id = p.id and f.status = 'final') as goals,
       (select count(*) from goals g join fixtures f on f.id = g.fixture_id
         where g.assist_id = p.id and f.status = 'final') as assists
from players p;

grant select on public_players, standings, leaders to anon, authenticated;

-- ---------- captain flow (private link, no login) ----------
create or replace function captain_context(p_token uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_team uuid;
begin
  select team_id into v_team from team_tokens where token = p_token;
  if v_team is null then raise exception 'This captain link is not valid.'; end if;
  return jsonb_build_object(
    'team', (select to_jsonb(x) from (select id, name, short_name, color_primary, color_secondary
                                     from teams where id = v_team) x),
    'players', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', display_name, 'position', position) order by sort)
                         from players where team_id = v_team and active), '[]'),
    'fixtures', coalesce((select jsonb_agg(to_jsonb(f) order by f.kickoff desc) from (
        select fx.id, fx.kickoff, fx.week, fx.home_team_id, fx.away_team_id, fx.status, fx.home_goals, fx.away_goals
        from fixtures fx
        where v_team in (fx.home_team_id, fx.away_team_id)
          and fx.status <> 'postponed'
          and fx.kickoff <= now() + interval '2 hours'
          and fx.kickoff >  now() - interval '21 days'
          and not exists (select 1 from submissions s
                          where s.fixture_id = fx.id and s.team_id = v_team and s.status in ('pending','approved'))
        order by fx.kickoff desc limit 3) f), '[]')
  );
end $$;

create or replace function submit_result(p_token uuid, p_fixture uuid, p_home int, p_away int, p_goals jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_team uuid; v_f fixtures; v_own int; v_id uuid;
begin
  select team_id into v_team from team_tokens where token = p_token;
  if v_team is null then raise exception 'This captain link is not valid.'; end if;
  select * into v_f from fixtures where id = p_fixture;
  if v_f.id is null or v_team not in (v_f.home_team_id, v_f.away_team_id) then
    raise exception 'This match does not belong to your team.';
  end if;
  if p_home not between 0 and 30 or p_away not between 0 and 30 then raise exception 'Check the score.'; end if;
  v_own := case when v_team = v_f.home_team_id then p_home else p_away end;
  if jsonb_typeof(p_goals) <> 'array' or jsonb_array_length(p_goals) <> v_own then
    raise exception 'Add one scorer line for each of your goals.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_goals) g
    where (nullif(g->>'scorer','') is not null and not exists
            (select 1 from players where id = (g->>'scorer')::uuid and team_id = v_team))
       or (nullif(g->>'assist','') is not null and not exists
            (select 1 from players where id = (g->>'assist')::uuid and team_id = v_team))
  ) then raise exception 'One of those players is not on your team.'; end if;

  update submissions set status = 'rejected', reviewed_at = now()
   where fixture_id = p_fixture and team_id = v_team and status = 'pending';
  insert into submissions (fixture_id, team_id, home_goals, away_goals, goals)
  values (p_fixture, v_team, p_home, p_away, p_goals) returning id into v_id;
  return v_id;
end $$;

-- ---------- admin actions ----------
create or replace function approve_submission(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s submissions;
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  select * into s from submissions where id = p_id for update;
  if s.id is null or s.status <> 'pending' then raise exception 'Nothing to approve.'; end if;
  update fixtures set home_goals = s.home_goals, away_goals = s.away_goals, status = 'final' where id = s.fixture_id;
  delete from goals where fixture_id = s.fixture_id and team_id = s.team_id;
  insert into goals (fixture_id, team_id, scorer_id, assist_id, submission_id)
  select s.fixture_id, s.team_id, nullif(g->>'scorer','')::uuid, nullif(g->>'assist','')::uuid, s.id
  from jsonb_array_elements(s.goals) g;
  update submissions set status = 'approved', reviewed_at = now() where id = s.id;
end $$;

create or replace function reject_submission(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only.'; end if;
  update submissions set status = 'rejected', reviewed_at = now() where id = p_id and status = 'pending';
end $$;

revoke execute on function approve_submission(uuid), reject_submission(uuid) from public, anon;
grant execute on function approve_submission(uuid), reject_submission(uuid) to authenticated;
grant execute on function captain_context(uuid), submit_result(uuid, uuid, int, int, jsonb) to anon, authenticated;
