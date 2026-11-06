-- Seed: Vernon Men's Indoor 2026-27 (real schedule, real teams, Alba squad).
-- Run once after schema.sql. Times are Vancouver local time.
do $$
declare l uuid; s uuid;
begin
  insert into leagues (slug, name, venue)
  values ('vernon-mens-indoor', 'Vernon Men''s Indoor', 'Marshall Fields indoor, Vernon') returning id into l;
  insert into seasons (league_id, name, starts_on, ends_on)
  values (l, '2026-27', '2026-10-14', '2027-03-27') returning id into s;

  insert into teams (season_id, slug, name, short_name, color_primary, color_secondary, colors_confirmed, rep_name, rep_email)
  select s, v.* from (values
    ('alba', 'Alba FC', 'ALB', '#c8102e', '#1f8a4c', true, 'Bekim Maliqi', 'bekim-maliqi@live.ca'),
    ('aq', 'Auto Quest', 'AQ', '#4b5563', '#cfd4da', false, 'Nicky Schultz', 'nickymud@gmail.com'),
    ('bas', 'Bastion FC', 'BAS', '#2e7d32', '#0d0d0d', false, 'Austin Smart', 'ozzyyzzo18@gmail.com'),
    ('alx', 'Alexanders', 'ALX', '#f2c200', '#111111', true, 'Brad Conlin / Robert Spraggs', 'bconlin46@gmail.com'),
    ('kid', 'Kidston FC', 'KID', '#1d4ed8', '#ffffff', true, 'Brent Poulson', 'Bpouls9@hotmail.com'),
    ('wan', 'Wanderers FC', 'WAN', '#7a4a24', '#efe2cc', true, 'Kailen Russell', 'kailenrussell03@gmail.com'),
    ('par', 'Parceros FC', 'PAR', '#c60b1e', '#ffc400', true, 'Daniel Vallejo', 'dgvallej10@gmail.com'),
    ('kal', 'Kal United', 'KAL', '#1b2a4a', '#ffffff', true, 'Brandon Richter', 'kalmalkaunited@gmail.com')
  ) v(slug, name, short_name, c1, c2, ok, rep, email);

  insert into team_tokens (team_id) select id from teams where season_id = s;

  insert into players (team_id, display_name, position, lineup_slot, sort)
  select t.id, v.n, v.p, v.slot, v.o from teams t, (values
    ('Hevzi', 'GK', 'GK', 0),
    ('JD', 'DEF', 'LCB', 1),
    ('Cassey', 'DEF', null, 2),
    ('Peter', 'DEF', 'RCB', 3),
    ('Nexa', 'DEF', null, 4),
    ('Amid', 'MID', 'LW', 5),
    ('Eddie', 'MID', null, 6),
    ('Dale', 'MID', 'LCM', 7),
    ('Karen', 'MID', null, 8),
    ('Caleb', 'MID', 'RCM', 9),
    ('Bekim', 'MID', null, 10),
    ('Kuda', 'MID', 'RW', 11),
    ('Santiago', 'MID', null, 12),
    ('Zack', 'FWD', 'ST', 13),
    ('Bhal', 'FWD', null, 14)
  ) v(n, p, slot, o)
  where t.season_id = s and t.slug = 'alba';

  insert into fixtures (season_id, week, code, kickoff, home_team_id, away_team_id)
  select s, v.week, v.code, (v.ko || ' America/Vancouver')::timestamptz, h.id, a.id
  from (values
    (1,'w1-0','2026-10-14 19:00','bas','wan'),
    (1,'w1-1','2026-10-14 20:40','kid','par'),
    (1,'w1-2','2026-10-17 18:00','aq','alba'),
    (1,'w1-3','2026-10-17 19:40','kal','alx'),
    (2,'w2-0','2026-10-21 19:00','bas','alba'),
    (2,'w2-1','2026-10-21 20:40','kid','kal'),
    (2,'w2-2','2026-10-24 18:00','aq','alx'),
    (2,'w2-3','2026-10-24 19:40','wan','par'),
    (3,'w3-0','2026-10-28 19:00','aq','kid'),
    (3,'w3-1','2026-10-28 20:40','alba','alx'),
    (3,'w3-2','2026-10-31 18:00','bas','par'),
    (3,'w3-3','2026-10-31 19:40','wan','kal'),
    (4,'w4-0','2026-11-04 19:00','bas','alx'),
    (4,'w4-1','2026-11-04 20:40','par','kal'),
    (4,'w4-2','2026-11-07 18:00','wan','aq'),
    (4,'w4-3','2026-11-07 19:40','alba','kid'),
    (5,'w5-0','2026-11-11 19:00','par','aq'),
    (5,'w5-1','2026-11-11 20:40','alba','wan'),
    (5,'w5-2','2026-11-14 18:00','bas','kal'),
    (5,'w5-3','2026-11-14 19:40','alx','kid'),
    (6,'w6-0','2026-11-18 19:00','kal','aq'),
    (6,'w6-1','2026-11-18 20:40','alx','wan'),
    (6,'w6-2','2026-11-21 18:00','bas','kid'),
    (6,'w6-3','2026-11-21 19:40','par','alba'),
    (7,'w7-0','2026-11-25 19:00','kid','wan'),
    (7,'w7-1','2026-11-25 20:40','kal','alba'),
    (7,'w7-2','2026-11-28 18:00','bas','aq'),
    (7,'w7-3','2026-11-28 19:40','alx','par'),
    (8,'w8-0','2026-12-02 19:00','bas','wan'),
    (8,'w8-1','2026-12-02 20:40','kid','par'),
    (8,'w8-2','2026-12-05 18:00','aq','alba'),
    (8,'w8-3','2026-12-05 19:40','kal','alx'),
    (9,'w9-0','2026-12-09 19:00','bas','alba'),
    (9,'w9-1','2026-12-09 20:40','kid','kal'),
    (9,'w9-2','2026-12-12 18:00','aq','alx'),
    (9,'w9-3','2026-12-12 19:40','wan','par'),
    (10,'w10-0','2026-12-16 19:00','aq','kid'),
    (10,'w10-1','2026-12-16 20:40','alba','alx'),
    (10,'w10-2','2026-12-19 18:00','bas','par'),
    (10,'w10-3','2026-12-19 19:40','wan','kal'),
    (11,'w11-0','2027-01-06 19:00','bas','alx'),
    (11,'w11-1','2027-01-06 20:40','par','kal'),
    (11,'w11-2','2027-01-09 18:00','wan','aq'),
    (11,'w11-3','2027-01-09 19:40','alba','kid'),
    (12,'w12-0','2027-01-13 19:00','par','aq'),
    (12,'w12-1','2027-01-13 20:40','alba','wan'),
    (12,'w12-2','2027-01-16 18:00','bas','kal'),
    (12,'w12-3','2027-01-16 19:40','alx','kid'),
    (13,'w13-0','2027-01-20 19:00','kal','aq'),
    (13,'w13-1','2027-01-20 20:40','alx','wan'),
    (13,'w13-2','2027-01-23 18:00','bas','kid'),
    (13,'w13-3','2027-01-23 19:40','par','alba'),
    (14,'w14-0','2027-01-27 19:00','bas','aq'),
    (14,'w14-1','2027-01-27 20:40','alx','par'),
    (14,'w14-2','2027-01-30 18:00','kal','alba'),
    (14,'w14-3','2027-01-30 19:40','kid','wan'),
    (15,'w15-0','2027-02-03 19:00','bas','wan'),
    (15,'w15-1','2027-02-03 20:40','kid','par'),
    (15,'w15-2','2027-02-06 18:00','aq','alba'),
    (15,'w15-3','2027-02-06 19:40','kal','alx'),
    (16,'w16-0','2027-02-10 19:00','bas','alba'),
    (16,'w16-1','2027-02-10 20:40','kid','kal'),
    (16,'w16-2','2027-02-13 18:00','aq','alx'),
    (16,'w16-3','2027-02-13 19:40','wan','par'),
    (17,'w17-0','2027-02-17 19:00','aq','kid'),
    (17,'w17-1','2027-02-17 20:40','alba','alx'),
    (17,'w17-2','2027-02-20 18:00','bas','par'),
    (17,'w17-3','2027-02-20 19:40','wan','kal'),
    (18,'w18-0','2027-02-24 19:00','bas','alx'),
    (18,'w18-1','2027-02-24 20:40','par','kal'),
    (18,'w18-2','2027-02-27 18:00','wan','aq'),
    (18,'w18-3','2027-02-27 19:40','alba','kid'),
    (19,'w19-0','2027-03-03 19:00','par','aq'),
    (19,'w19-1','2027-03-03 20:40','alba','wan'),
    (19,'w19-2','2027-03-06 18:00','bas','kal'),
    (19,'w19-3','2027-03-06 19:40','alx','kid'),
    (20,'w20-0','2027-03-10 19:00','kal','aq'),
    (20,'w20-1','2027-03-10 20:40','alx','wan'),
    (20,'w20-2','2027-03-13 18:00','bas','kid'),
    (20,'w20-3','2027-03-13 19:40','par','alba')
  ) v(week, code, ko, hs, aws)
  join teams h on h.season_id = s and h.slug = v.hs
  join teams a on a.season_id = s and a.slug = v.aws;

  -- Alba FC's confirmed results (scorers not known yet)
  update fixtures set status = 'final', home_goals = 6, away_goals = 3 where season_id = s and code = 'w1-2';
  update fixtures set status = 'final', home_goals = 5, away_goals = 3 where season_id = s and code = 'w2-0';
  update fixtures set status = 'final', home_goals = 1, away_goals = 3 where season_id = s and code = 'w3-1';
end $$;
