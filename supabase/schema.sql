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

-- Either participant may report; the first report wins and later calls return the stored result.
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

  begin
    select elo into we from profiles where id = p_winner for update;
    select elo into le from profiles where id = p_loser for update;
    expected := 1.0 / (1.0 + power(10.0, (le - we) / 400.0));
    d := greatest(5, round(32 * (1 - expected)))::int;

    update profiles set elo = elo + d, peak_elo = greatest(peak_elo, elo + d),
           ranked_wins = ranked_wins + 1 where id = p_winner;
    update profiles set elo = greatest(0, elo - d),
           ranked_losses = ranked_losses + 1 where id = p_loser;
    insert into ranked_matches values (p_match_id, p_winner, p_loser, d, -d, now());
  exception when unique_violation then
    select * into r from ranked_matches where match_id = p_match_id;
    return json_build_object('winner', r.winner, 'winner_delta', r.winner_delta, 'loser_delta', r.loser_delta);
  end;

  return json_build_object('winner', p_winner, 'winner_delta', d, 'loser_delta', -d);
end;
$$;

-- Records the caller's own result. Online matches update stats; offline matches only grant XP.
-- The older 11-argument version is dropped so the RPC isn't ambiguous.
drop function if exists public.record_match(text, text, text, boolean, boolean, text, int, int, int, text, int);
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

  gained := k * 10 + case p_result when 'win' then 100 when 'draw' then 50 else 25 end;

  if p_online then
    update profiles set
      matches = matches + 1,
      wins = wins + (p_result = 'win')::int,
      losses = losses + (p_result = 'loss')::int,
      kills = kills + k, deaths = deaths + dth, headshots = headshots + hs,
      xp = xp + gained, last_seen = now()
    where id = uid;
  else
    update profiles set xp = xp + gained / 2, last_seen = now() where id = uid;
  end if;
end;
$$;

revoke all on function public.report_ranked(text, uuid, uuid) from public, anon;
revoke all on function public.record_match(text, text, text, boolean, boolean, text, int, int, int, text, int, jsonb) from public, anon;
grant execute on function public.report_ranked(text, uuid, uuid) to authenticated;
grant execute on function public.record_match(text, text, text, boolean, boolean, text, int, int, int, text, int, jsonb) to authenticated;
