-- John-Paul Simulator — Supabase schema
-- Paste this whole file into Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run.

-- ───────────────────────── profiles ─────────────────────────
create table if not exists public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  username      text unique not null
                check (char_length(username) between 3 and 16 and username ~ '^[A-Za-z0-9_]+$'),
  elo           int  not null default 1000,
  peak_elo      int  not null default 1000,
  ranked_wins   int  not null default 0,
  ranked_losses int  not null default 0,
  wins          int  not null default 0,
  losses        int  not null default 0,
  matches       int  not null default 0,
  kills         int  not null default 0,
  deaths        int  not null default 0,
  headshots     int  not null default 0,
  xp            int  not null default 0,
  character     jsonb,
  created_at    timestamptz not null default now(),
  last_seen     timestamptz not null default now()
);

-- Collected cosmetics (weapon finishes + outfits). Added after launch, so use IF NOT EXISTS.
alter table public.profiles add column if not exists inventory jsonb not null default '{}'::jsonb;

alter table public.profiles enable row level security;

drop policy if exists "profiles are public" on public.profiles;
create policy "profiles are public" on public.profiles for select using (true);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Players may only edit cosmetic columns directly; stats change through the functions below.
revoke update on public.profiles from anon, authenticated;
grant update (character, last_seen, inventory) on public.profiles to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── match history ─────────────────────────
create table if not exists public.match_history (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  match_id    text not null,
  mode        text not null,
  map         text not null,
  ranked      boolean not null default false,
  online      boolean not null default true,
  result      text not null check (result in ('win', 'loss', 'draw')),
  kills       int not null default 0,
  deaths      int not null default 0,
  headshots   int not null default 0,
  score       text,
  elo_change  int not null default 0,
  created_at  timestamptz not null default now(),
  unique (user_id, match_id)
);
create index if not exists match_history_user_idx on public.match_history (user_id, created_at desc);
-- Per-match details for the stats page (weapon kills, accuracy, head-to-head, death spots).
alter table public.match_history add column if not exists details jsonb;

alter table public.match_history enable row level security;
drop policy if exists "history is public" on public.match_history;
create policy "history is public" on public.match_history for select using (true);

-- ───────────────────────── ranked results ─────────────────────────
create table if not exists public.ranked_matches (
  match_id     text primary key,
  winner       uuid not null references public.profiles(id) on delete cascade,
  loser        uuid not null references public.profiles(id) on delete cascade,
  winner_delta int  not null,
  loser_delta  int  not null,
  created_at   timestamptz not null default now()
);
alter table public.ranked_matches enable row level security;
drop policy if exists "ranked results are public" on public.ranked_matches;
create policy "ranked results are public" on public.ranked_matches for select using (true);

-- report_ranked and record_match are defined further down (with season tracking and ban checks).

-- The older 11-argument record_match is dropped so the RPC isn't ambiguous.
drop function if exists public.record_match(text, text, text, boolean, boolean, text, int, int, int, text, int);


-- ═════════════════════════ seasons, challenges, commends, reports ═════════════════════════
-- Added November 2026. Safe to re-run.

-- ───────────── seasons ─────────────
-- Season boundaries live here (UTC). The client reads this table; rewards and names are in js/data/seasons.js.
create table if not exists public.seasons (
  id        text primary key,
  num       int  not null,
  name      text not null,
  starts_at timestamptz not null,
  ends_at   timestamptz not null
);
alter table public.seasons enable row level security;
revoke insert, update, delete on public.seasons from anon, authenticated;
drop policy if exists "seasons are public" on public.seasons;
create policy "seasons are public" on public.seasons for select using (true);
insert into public.seasons (id, num, name, starts_at, ends_at) values
  ('s1', 1, 'First Contact', '2026-11-01 00:00:00+00', '2027-01-01 00:00:00+00'),
  ('s2', 2, 'Frostline',     '2027-01-01 00:00:00+00', '2027-04-01 00:00:00+00'),
  ('s3', 3, 'Overgrowth',    '2027-04-01 00:00:00+00', '2027-07-01 00:00:00+00'),
  ('s4', 4, 'Heatwave',      '2027-07-01 00:00:00+00', '2027-10-01 00:00:00+00'),
  ('s5', 5, 'Nightfall',     '2027-10-01 00:00:00+00', '2028-01-01 00:00:00+00')
on conflict (id) do update set num = excluded.num, name = excluded.name, starts_at = excluded.starts_at, ends_at = excluded.ends_at;

-- Per-season progress on the profile. Written only by the functions below.
alter table public.profiles add column if not exists season_id     text;
alter table public.profiles add column if not exists pass_xp       int not null default 0;
alter table public.profiles add column if not exists season_wins   int not null default 0;
alter table public.profiles add column if not exists season_losses int not null default 0;
alter table public.profiles add column if not exists season_peak   int not null default 1000;
-- Challenge progress is tracked by the client (like match stats); claims are checked by claim_challenge.
alter table public.profiles add column if not exists challenges    jsonb not null default '{}'::jsonb;
grant update (challenges) on public.profiles to authenticated;

create table if not exists public.season_history (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  season_id   text not null references public.seasons(id),
  final_elo   int  not null,
  peak_elo    int  not null,
  wins        int  not null,
  losses      int  not null,
  pass_xp     int  not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, season_id)
);
alter table public.season_history enable row level security;
revoke insert, update, delete on public.season_history from anon, authenticated;
drop policy if exists "season history is public" on public.season_history;
create policy "season history is public" on public.season_history for select using (true);

create or replace function public.current_season()
returns text language sql stable set search_path = public as $$
  select id from seasons where now() >= starts_at and now() < ends_at order by starts_at limit 1;
$$;

-- Moves a player into the current season the first time they play in it. On a rollover the old
-- season is archived and ELO is pulled halfway back to 1000 (a soft reset). Safe to call repeatedly.
create or replace function public.ensure_season(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare cur text := current_season(); p profiles%rowtype;
begin
  if cur is null then return; end if;
  select * into p from profiles where id = p_user for update;
  if not found or p.season_id is not distinct from cur then return; end if;
  if p.season_id is not null then
    insert into season_history (user_id, season_id, final_elo, peak_elo, wins, losses, pass_xp)
    values (p_user, p.season_id, p.elo, p.season_peak, p.season_wins, p.season_losses, p.pass_xp)
    on conflict do nothing;
    update profiles set elo = 1000 + round((elo - 1000) / 2.0)::int where id = p_user;
  end if;
  update profiles set season_id = cur, pass_xp = 0, season_wins = 0, season_losses = 0, season_peak = elo where id = p_user;
end;
$$;

-- What the signed-in player's client needs to know about itself (polled every half minute).
-- Also moves the player into the current season the first time they come online in it.
create or replace function public.my_status()
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return null; end if;
  perform ensure_season(uid);
  return json_build_object('season', current_season());
end;
$$;

-- ───────────── commends and reports ─────────────
create table if not exists public.commends (
  from_id    uuid not null references public.profiles(id) on delete cascade,
  to_id      uuid not null references public.profiles(id) on delete cascade,
  match_id   text not null,
  kind       text not null check (kind in ('friendly', 'leader', 'teacher', 'clutch')),
  created_at timestamptz not null default now(),
  primary key (from_id, to_id, match_id)
);
alter table public.commends enable row level security;
revoke all on public.commends from anon, authenticated;

create or replace function public.commend_player(p_to uuid, p_match text, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_to = uid then raise exception 'you cannot commend yourself'; end if;
  if not exists (select 1 from profiles where id = p_to) then raise exception 'player not found'; end if;
  if (select count(*) from commends where from_id = uid and created_at > now() - interval '1 day') >= 30 then raise exception 'daily commend limit reached'; end if;
  insert into commends (from_id, to_id, match_id, kind) values (uid, p_to, left(p_match, 64), p_kind) on conflict do nothing;
end;
$$;

create or replace function public.player_commends(p_id uuid)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_object_agg(kind, n), '{}') from (select kind, count(*) n from commends where to_id = p_id group by kind) t;
$$;

create table if not exists public.reports (
  id          bigint generated always as identity primary key,
  reporter    uuid not null references public.profiles(id) on delete cascade,
  target      uuid not null references public.profiles(id) on delete cascade,
  match_id    text not null,
  mode        text,
  reason      text not null check (reason in ('cheating', 'griefing', 'abuse', 'name', 'afk', 'other')),
  note        text check (char_length(note) <= 500),
  evidence    jsonb,
  status      text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  resolution  text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (reporter, target, match_id)
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;

create or replace function public.report_player(p_target uuid, p_match text, p_mode text, p_reason text, p_note text, p_evidence jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_target = uid then raise exception 'you cannot report yourself'; end if;
  if not exists (select 1 from profiles where id = p_target) then raise exception 'player not found'; end if;
  if (select count(*) from reports where reporter = uid and created_at > now() - interval '1 day') >= 20 then raise exception 'daily report limit reached'; end if;
  insert into reports (reporter, target, match_id, mode, reason, note, evidence)
  values (uid, p_target, left(p_match, 64), left(p_mode, 20), p_reason, left(p_note, 500),
          case when p_evidence is not null and pg_column_size(p_evidence) <= 16000 then p_evidence end)
  on conflict (reporter, target, match_id) do update set reason = excluded.reason, note = excluded.note, evidence = excluded.evidence;
end;
$$;

-- ───────────── challenges ─────────────
create table if not exists public.challenge_claims (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  key        text not null,
  xp         int  not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.challenge_claims enable row level security;
revoke all on public.challenge_claims from anon, authenticated;

-- Keys look like d:2026-11-13:0 (daily) or w:2026-W46:2 (weekly). Only the current day or week,
-- three of each, with fixed rewards, so a tampered client can't farm XP.
create or replace function public.claim_challenge(p_key text)
returns int language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); amount int; parts text[] := string_to_array(p_key, ':');
begin
  if uid is null then raise exception 'not signed in'; end if;
  if array_length(parts, 1) <> 3 or parts[3] not in ('0', '1', '2') then raise exception 'invalid challenge'; end if;
  if parts[1] = 'd' and parts[2] = to_char(now() at time zone 'utc', 'YYYY-MM-DD') then amount := 300;
  elsif parts[1] = 'w' and parts[2] = to_char(now() at time zone 'utc', 'IYYY-"W"IW') then amount := 1000;
  else raise exception 'that challenge has expired'; end if;
  insert into challenge_claims (user_id, key, xp) values (uid, p_key, amount) on conflict do nothing;
  if not found then return 0; end if;
  perform ensure_season(uid);
  update profiles set xp = xp + amount, pass_xp = pass_xp + amount where id = uid;
  return amount;
end;
$$;

-- ───────────── ranked and match results: season tracking + bans ─────────────
create or replace function public.report_ranked(p_match_id text, p_winner uuid, p_loser uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  r ranked_matches%rowtype;
  we int; le int; expected float; d int;
begin
  if auth.uid() is null or auth.uid() not in (p_winner, p_loser) then
    raise exception 'not a participant';
  end if;
  if p_winner = p_loser then raise exception 'invalid result'; end if;

  select * into r from ranked_matches where match_id = p_match_id;
  if found then
    return json_build_object('winner', r.winner, 'winner_delta', r.winner_delta, 'loser_delta', r.loser_delta);
  end if;

  perform ensure_season(p_winner);
  perform ensure_season(p_loser);
  begin
    select elo into we from profiles where id = p_winner for update;
    select elo into le from profiles where id = p_loser for update;
    expected := 1.0 / (1.0 + power(10.0, (le - we) / 400.0));
    d := greatest(5, round(32 * (1 - expected)))::int;

    update profiles set elo = elo + d, peak_elo = greatest(peak_elo, elo + d), season_peak = greatest(season_peak, elo + d),
           ranked_wins = ranked_wins + 1, season_wins = season_wins + 1 where id = p_winner;
    update profiles set elo = greatest(0, elo - d),
           ranked_losses = ranked_losses + 1, season_losses = season_losses + 1 where id = p_loser;
    insert into ranked_matches values (p_match_id, p_winner, p_loser, d, -d, now());
  exception when unique_violation then
    select * into r from ranked_matches where match_id = p_match_id;
    return json_build_object('winner', r.winner, 'winner_delta', r.winner_delta, 'loser_delta', r.loser_delta);
  end;

  return json_build_object('winner', p_winner, 'winner_delta', d, 'loser_delta', -d);
end;
$$;

create or replace function public.record_match(
  p_match_id text, p_mode text, p_map text, p_ranked boolean, p_online boolean,
  p_result text, p_kills int, p_deaths int, p_headshots int, p_score text, p_elo_change int,
  p_details jsonb default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  k int := least(greatest(p_kills, 0), 150);
  dth int := least(greatest(p_deaths, 0), 150);
  hs int := least(greatest(p_headshots, 0), k);
  gained int;
  det jsonb := case when p_details is not null and pg_column_size(p_details) <= 16000 then p_details end;
begin
  if uid is null then raise exception 'not signed in'; end if;

  insert into match_history (user_id, match_id, mode, map, ranked, online, result, kills, deaths, headshots, score, elo_change, details)
  values (uid, p_match_id, p_mode, p_map, p_ranked, p_online, p_result, k, dth, hs, p_score, coalesce(p_elo_change, 0), det)
  on conflict (user_id, match_id) do nothing;
  if not found then return; end if;

  perform ensure_season(uid);
  gained := k * 10 + case p_result when 'win' then 100 when 'draw' then 50 else 25 end;


  if p_online then
    update profiles set
      matches = matches + 1,
      wins = wins + (p_result = 'win')::int,
      losses = losses + (p_result = 'loss')::int,
      kills = kills + k, deaths = deaths + dth, headshots = headshots + hs,
      xp = xp + gained, pass_xp = pass_xp + gained, last_seen = now()
    where id = uid;
  else
    update profiles set xp = xp + gained / 2, pass_xp = pass_xp + gained / 2, last_seen = now() where id = uid;
  end if;
end;
$$;

-- ───────────── function permissions ─────────────
-- Internal helpers are not callable from the app at all.
revoke all on function public.ensure_season(uuid) from public, anon, authenticated;

revoke all on function public.current_season() from public;
grant execute on function public.current_season() to anon, authenticated;
revoke all on function public.player_commends(uuid) from public;
grant execute on function public.player_commends(uuid) to anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'my_status()', 'commend_player(uuid, text, text)',
    'report_player(uuid, text, text, text, text, jsonb)', 'claim_challenge(text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

revoke all on function public.report_ranked(text, uuid, uuid) from public, anon;
revoke all on function public.record_match(text, text, text, boolean, boolean, text, int, int, int, text, int, jsonb) from public, anon;
grant execute on function public.report_ranked(text, uuid, uuid) to authenticated;
grant execute on function public.record_match(text, text, text, boolean, boolean, text, int, int, int, text, int, jsonb) to authenticated;
