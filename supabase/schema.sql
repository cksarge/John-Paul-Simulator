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
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

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


-- ═════════════════════════ seasons, challenges, commends, reports, admin ═════════════════════════
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
-- Achievements (js/data/achievements.js): tracked by the client like challenges. Badges only, no rewards.
alter table public.profiles add column if not exists achievements jsonb not null default '{}'::jsonb;
alter table public.profiles drop constraint if exists achievements_size;
alter table public.profiles add constraint achievements_size check (pg_column_size(achievements) <= 16000);
grant update (achievements) on public.profiles to authenticated;

-- Ranked results an admin has voided are kept, flagged, so the match can't be reported again.
alter table public.ranked_matches add column if not exists voided boolean not null default false;

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

-- ───────────── moderation (private: each player sees only their own row) ─────────────
create table if not exists public.admins (user_id uuid primary key references public.profiles(id) on delete cascade);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
-- The only admin is Carter. Nothing in the app can add rows here. On a database where that account
-- doesn't exist (a new project or a fork) this adds nobody instead of failing.
insert into public.admins (user_id)
select id from public.profiles where id = '161b8bab-6d36-4845-8179-3e72255f466b'
on conflict do nothing;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from admins where user_id = auth.uid());
$$;

create table if not exists public.moderation (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  banned_until timestamptz,
  ban_reason   text,
  muted_until  timestamptz,
  mute_reason  text,
  kick_at      timestamptz,
  kick_reason  text,
  updated_at   timestamptz not null default now()
);
alter table public.moderation enable row level security;
revoke all on public.moderation from anon, authenticated;
grant select on public.moderation to authenticated;
drop policy if exists "own moderation" on public.moderation;
create policy "own moderation" on public.moderation for select using ((select auth.uid()) = user_id);

create table if not exists public.warnings (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  message    text not null,
  seen       boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.warnings enable row level security;
revoke all on public.warnings from anon, authenticated;
grant select on public.warnings to authenticated;
drop policy if exists "own warnings" on public.warnings;
create policy "own warnings" on public.warnings for select using ((select auth.uid()) = user_id);

-- Items an admin gives or takes away; the player's client applies them to its inventory.
create table if not exists public.item_grants (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  item       text not null,
  revoke     boolean not null default false,
  applied    boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.item_grants enable row level security;
revoke all on public.item_grants from anon, authenticated;
grant select on public.item_grants to authenticated;
drop policy if exists "own grants" on public.item_grants;
create policy "own grants" on public.item_grants for select using ((select auth.uid()) = user_id);

create table if not exists public.announcements (
  id         bigint generated always as identity primary key,
  message    text not null check (char_length(message) between 1 and 300),
  kind       text not null default 'info' check (kind in ('info', 'warn', 'event')),
  starts_at  timestamptz not null default now(),
  ends_at    timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null
);
alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to anon, authenticated;
drop policy if exists "live announcements are public" on public.announcements;
create policy "live announcements are public" on public.announcements for select using (now() >= starts_at and now() < ends_at);

-- Global switches such as maintenance mode: {"maintenance": {"on": true, "message": "..."}}.
create table if not exists public.app_settings (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to anon, authenticated;
drop policy if exists "settings are public" on public.app_settings;
create policy "settings are public" on public.app_settings for select using (true);

create table if not exists public.admin_audit (
  id         bigint generated always as identity primary key,
  admin_id   uuid not null,
  action     text not null,
  target     text,
  details    jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated;

create or replace function public.is_banned(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from moderation where user_id = p_user and banned_until is not null and banned_until > now());
$$;

-- Ban and mute flags for a list of players (ids only, no reasons), so clients can keep banned
-- players out of queues and lobbies and hide chat from muted ones.
create or replace function public.moderation_flags(p_ids uuid[])
returns table (id uuid, banned boolean, muted boolean) language sql stable security definer set search_path = public as $$
  select m.user_id, coalesce(m.banned_until > now(), false), coalesce(m.muted_until > now(), false)
  from moderation m where m.user_id = any(p_ids[1:100])
    and ((m.banned_until is not null and m.banned_until > now()) or (m.muted_until is not null and m.muted_until > now()));
$$;

-- Everything the signed-in player's client needs to know about itself, polled every half minute.
create or replace function public.my_status()
returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); m moderation%rowtype;
begin
  if uid is null then return null; end if;
  perform ensure_season(uid);
  select * into m from moderation where user_id = uid;
  return json_build_object(
    'banned_until', case when m.banned_until > now() then m.banned_until end, 'ban_reason', m.ban_reason,
    'muted_until', case when m.muted_until > now() then m.muted_until end, 'mute_reason', m.mute_reason,
    'kick_at', m.kick_at, 'kick_reason', m.kick_reason,
    'warnings', (select coalesce(json_agg(json_build_object('id', w.id, 'message', w.message, 'at', w.created_at) order by w.id), '[]') from warnings w where w.user_id = uid and not w.seen),
    'grants', (select coalesce(json_agg(json_build_object('id', g.id, 'kind', g.kind, 'item', g.item, 'revoke', g.revoke) order by g.id), '[]') from item_grants g where g.user_id = uid and not g.applied),
    'season', current_season(),
    'admin', is_admin(),
    'friend_requests', (select count(*) from friends where friend_id = uid and status = 'pending')
  );
end;
$$;

create or replace function public.ack_status(p_warnings bigint[], p_grants bigint[])
returns void language sql security definer set search_path = public as $$
  update warnings set seen = true where user_id = auth.uid() and id = any(p_warnings);
  update item_grants set applied = true where user_id = auth.uid() and id = any(p_grants);
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
  if is_banned(uid) then raise exception 'account banned'; end if;
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
  if is_banned(uid) then raise exception 'account banned'; end if;
  if p_target = uid then raise exception 'you cannot report yourself'; end if;
  if not exists (select 1 from profiles where id = p_target) then raise exception 'player not found'; end if;
  if (select count(*) from reports where reporter = uid and created_at > now() - interval '1 day') >= 20 then raise exception 'daily report limit reached'; end if;
  insert into reports (reporter, target, match_id, mode, reason, note, evidence)
  values (uid, p_target, left(p_match, 64), left(p_mode, 20), p_reason, left(p_note, 500),
          case when p_evidence is not null and pg_column_size(p_evidence) <= 16000 then p_evidence end)
  on conflict (reporter, target, match_id) do update set reason = excluded.reason, note = excluded.note, evidence = excluded.evidence;
end;
$$;

-- ───────────── friends ─────────────
-- One row per pair: user_id sent the request, friend_id received it. Private: only changed and
-- read through the functions below.
create table if not exists public.friends (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  friend_id   uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);
create index if not exists friends_friend_idx on public.friends (friend_id);
alter table public.friends enable row level security;
revoke all on public.friends from anon, authenticated;

-- Sends a friend request, or accepts theirs if they already asked you. Returns 'sent', 'accepted' or 'already'.
create or replace function public.friend_request(p_to uuid)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r friends%rowtype;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if is_banned(uid) then raise exception 'account banned'; end if;
  if p_to = uid then raise exception 'you can''t add yourself'; end if;
  if not exists (select 1 from profiles where id = p_to) then raise exception 'player not found'; end if;
  select * into r from friends where (user_id = uid and friend_id = p_to) or (user_id = p_to and friend_id = uid) for update;
  if found then
    if r.status = 'accepted' then return 'already'; end if;
    if r.user_id = uid then return 'sent'; end if;
    update friends set status = 'accepted', accepted_at = now() where user_id = p_to and friend_id = uid;
    return 'accepted';
  end if;
  if (select count(*) from friends where (user_id = uid or friend_id = uid) and status = 'accepted') >= 200 then raise exception 'friends list is full (200)'; end if;
  if (select count(*) from friends where user_id = uid and created_at > now() - interval '1 day') >= 30 then raise exception 'daily friend request limit reached'; end if;
  insert into friends (user_id, friend_id) values (uid, p_to);
  return 'sent';
end;
$$;

create or replace function public.friend_respond(p_from uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_accept then
    update friends set status = 'accepted', accepted_at = now() where user_id = p_from and friend_id = uid and status = 'pending';
  else
    delete from friends where user_id = p_from and friend_id = uid and status = 'pending';
  end if;
end;
$$;

-- Unfriends, or cancels a request you sent.
create or replace function public.friend_remove(p_id uuid)
returns void language sql security definer set search_path = public as $$
  delete from friends where (user_id = auth.uid() and friend_id = p_id) or (user_id = p_id and friend_id = auth.uid());
$$;

-- Your friends and pending requests, with what the friends list shows about each player.
create or replace function public.my_friends()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
    'id', p.id, 'username', p.username, 'elo', p.elo, 'xp', p.xp, 'last_seen', p.last_seen,
    'card', p.character ->> 'card', 'status', f.status, 'incoming', f.friend_id = auth.uid(), 'since', coalesce(f.accepted_at, f.created_at)
  ) order by p.username), '[]')
  from friends f join profiles p on p.id = case when f.user_id = auth.uid() then f.friend_id else f.user_id end
  where auth.uid() is not null and (f.user_id = auth.uid() or f.friend_id = auth.uid());
$$;

-- ───────────── custom maps (map editor) ─────────────
-- Up to 5 per account. `data` is the grid ({w, h, rows, spawns, sites, theme}); the game cleans it
-- again before use (js/data/custommaps.js). Featured slots 1-2 are small maps, 3-4 large; players
-- like maps and the admin picks which ones fill the slots. Everyone can read maps; changes go
-- through the functions below.
create table if not exists public.custom_maps (
  id            bigint generated always as identity primary key,
  owner         uuid not null references public.profiles(id) on delete cascade,
  name          text not null check (char_length(name) between 3 and 24),
  description   text check (char_length(description) <= 120),
  size          text not null check (size in ('small', 'large')),
  data          jsonb not null check (pg_column_size(data) <= 24000),
  likes         int not null default 0,
  featured_slot int check (featured_slot between 1 and 4),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists custom_maps_owner_idx on public.custom_maps (owner);
create index if not exists custom_maps_likes_idx on public.custom_maps (likes desc);
create unique index if not exists custom_maps_slot_idx on public.custom_maps (featured_slot) where featured_slot is not null;
alter table public.custom_maps enable row level security;
revoke all on public.custom_maps from anon, authenticated;
grant select on public.custom_maps to anon, authenticated;
drop policy if exists "maps are public" on public.custom_maps;
create policy "maps are public" on public.custom_maps for select using (true);

create table if not exists public.map_likes (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  map_id     bigint not null references public.custom_maps(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, map_id)
);
alter table public.map_likes enable row level security;
revoke all on public.map_likes from anon, authenticated;

-- Creates (p_id null) or updates one of your maps. Returns its id. Editing a featured map takes it
-- out of its slot until the admin approves it again.
create or replace function public.save_custom_map(p_id bigint, p_name text, p_description text, p_size text, p_data jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); new_id bigint; w int; h int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if is_banned(uid) then raise exception 'account banned'; end if;
  if p_name !~ '^[A-Za-z0-9 _''-]{3,24}$' then raise exception 'map names are 3-24 letters, numbers, spaces, - or _'; end if;
  if p_size not in ('small', 'large') then raise exception 'invalid map size'; end if;
  if p_data is null or pg_column_size(p_data) > 24000 then raise exception 'map is too big'; end if;
  w := (p_data ->> 'w')::int; h := (p_data ->> 'h')::int;
  if w is null or h is null or w < 14 or h < 10 or w > 52 or h > 48 or jsonb_array_length(p_data -> 'rows') <> h then raise exception 'invalid map grid'; end if;
  if p_id is null then
    if (select count(*) from custom_maps where owner = uid) >= 5 then raise exception 'you can upload up to 5 maps. Delete one first.'; end if;
    insert into custom_maps (owner, name, description, size, data) values (uid, p_name, left(p_description, 120), p_size, p_data) returning id into new_id;
    return new_id;
  end if;
  update custom_maps set name = p_name, description = left(p_description, 120), size = p_size, data = p_data, featured_slot = null, updated_at = now()
  where id = p_id and owner = uid;
  if not found then raise exception 'map not found'; end if;
  return p_id;
end;
$$;

create or replace function public.delete_custom_map(p_id bigint)
returns void language sql security definer set search_path = public as $$
  delete from custom_maps where id = p_id and owner = auth.uid();
$$;

-- Likes or unlikes a map. Returns its new like count.
create or replace function public.like_custom_map(p_id bigint, p_like boolean)
returns int language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if is_banned(uid) then raise exception 'account banned'; end if;
  if p_like then insert into map_likes (user_id, map_id) values (uid, p_id) on conflict do nothing;
  else delete from map_likes where user_id = uid and map_id = p_id; end if;
  update custom_maps set likes = (select count(*) from map_likes where map_id = p_id) where id = p_id returning likes into n;
  return coalesce(n, 0);
end;
$$;

create or replace function public.my_map_likes()
returns bigint[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(map_id), '{}') from map_likes where user_id = auth.uid();
$$;

-- ───────────── feedback and bug reports ─────────────
-- Sent from the Feedback button in the menu; only the admin can read them (admin_feedback).
create table if not exists public.feedback (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('bug', 'feedback', 'idea')),
  message     text not null check (char_length(message) between 5 and 2000),
  context     jsonb check (context is null or pg_column_size(context) <= 4000),
  status      text not null default 'open' check (status in ('open', 'resolved')),
  admin_note  text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists feedback_status_idx on public.feedback (status, created_at desc);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;

create or replace function public.submit_feedback(p_kind text, p_message text, p_context jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'sign in to send feedback'; end if;
  if is_banned(uid) then raise exception 'account banned'; end if;
  if p_kind not in ('bug', 'feedback', 'idea') then raise exception 'invalid type'; end if;
  if char_length(trim(coalesce(p_message, ''))) < 5 then raise exception 'write a little more (at least 5 characters)'; end if;
  if (select count(*) from feedback where user_id = uid and created_at > now() - interval '1 day') >= 10 then raise exception 'you can send 10 messages a day. Thanks for all the feedback!'; end if;
  insert into feedback (user_id, kind, message, context)
  values (uid, p_kind, left(trim(p_message), 2000), case when p_context is not null and pg_column_size(p_context) <= 4000 then p_context end);
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
  if is_banned(uid) then raise exception 'account banned'; end if;
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
  if is_banned(auth.uid()) then raise exception 'account banned'; end if;

  select * into r from ranked_matches where match_id = p_match_id;
  if found then
    -- Voided results stay recorded (so they can't be reported again) and count for nothing.
    if r.voided then return json_build_object('winner', r.winner, 'winner_delta', 0, 'loser_delta', 0); end if;
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
    -- Store what the loser actually lost (rating never goes below 0) so a void can reverse it exactly.
    insert into ranked_matches (match_id, winner, loser, winner_delta, loser_delta, created_at)
    values (p_match_id, p_winner, p_loser, d, -least(d, le), now());
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
  if is_banned(uid) then raise exception 'account banned'; end if;

  insert into match_history (user_id, match_id, mode, map, ranked, online, result, kills, deaths, headshots, score, elo_change, details)
  values (uid, p_match_id, p_mode, p_map, p_ranked, p_online, p_result, k, dth, hs, p_score, coalesce(p_elo_change, 0), det)
  on conflict (user_id, match_id) do nothing;
  if not found then return; end if;

  perform ensure_season(uid);
  gained := k * 10 + case p_result when 'win' then 100 when 'draw' then 50 else 25 end;
  -- Admin XP events: {"multiplier": 2, "until": "<timestamp>"} in app_settings.xp_boost.
  gained := round(gained * coalesce((select least(greatest((value ->> 'multiplier')::numeric, 1), 3) from app_settings
    where key = 'xp_boost' and (value ->> 'until')::timestamptz > now()), 1))::int;

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

-- ───────────── admin functions (each one refuses anyone who isn't in public.admins) ─────────────
create or replace function public.admin_guard()
returns uuid language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  return auth.uid();
end;
$$;

create or replace function public.admin_log(p_action text, p_target text, p_details jsonb)
returns void language sql security definer set search_path = public as $$
  insert into admin_audit (admin_id, action, target, details) values (auth.uid(), p_action, p_target, p_details);
$$;

create or replace function public.admin_overview()
returns json language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  return json_build_object(
    'players', (select count(*) from profiles),
    'new_today', (select count(*) from profiles where created_at > now() - interval '1 day'),
    'active_today', (select count(*) from profiles where last_seen > now() - interval '1 day'),
    'matches_today', (select count(*) from match_history where created_at > now() - interval '1 day'),
    'open_reports', (select count(*) from reports where status = 'open'),
    'open_feedback', (select count(*) from feedback where status = 'open'),
    'banned', (select count(*) from moderation where banned_until > now()),
    'muted', (select count(*) from moderation where muted_until > now()),
    'season', current_season(),
    'settings', (select coalesce(json_object_agg(key, value), '{}') from app_settings)
  );
end;
$$;

create or replace function public.admin_reports(p_status text default 'open', p_limit int default 100)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  return (select coalesce(json_agg(row_to_json(t)), '[]') from (
    select r.*, rp.username as reporter_name, tp.username as target_name,
      (select count(*) from reports x where x.target = r.target) as target_report_count
    from reports r join profiles rp on rp.id = r.reporter join profiles tp on tp.id = r.target
    where p_status = 'all' or r.status = p_status
    order by r.created_at desc limit least(p_limit, 500)) t);
end;
$$;

create or replace function public.admin_resolve_report(p_id bigint, p_status text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  if p_status not in ('open', 'actioned', 'dismissed') then raise exception 'invalid status'; end if;
  update reports set status = p_status, resolution = left(p_note, 500), resolved_by = auth.uid(),
    resolved_at = case when p_status = 'open' then null else now() end where id = p_id;
  perform admin_log('resolve_report', p_id::text, json_build_object('status', p_status, 'note', p_note)::jsonb);
end;
$$;

-- Full picture of one player for the admin panel.
create or replace function public.admin_player(p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  return json_build_object(
    'profile', (select row_to_json(p) from profiles p where p.id = p_id),
    'moderation', (select row_to_json(m) from moderation m where m.user_id = p_id),
    'is_admin', exists (select 1 from admins where user_id = p_id),
    'warnings', (select coalesce(json_agg(w order by w.id desc), '[]') from warnings w where w.user_id = p_id),
    'reports_against', (select coalesce(json_agg(row_to_json(t)), '[]') from (select r.*, rp.username as reporter_name from reports r join profiles rp on rp.id = r.reporter where r.target = p_id order by r.created_at desc limit 50) t),
    'reports_filed', (select count(*) from reports where reporter = p_id),
    'commends', player_commends(p_id),
    'matches', (select coalesce(json_agg(row_to_json(t)), '[]') from (select id, match_id, mode, map, ranked, online, result, kills, deaths, headshots, score, elo_change, created_at from match_history where user_id = p_id order by created_at desc limit 30) t),
    'seasons', (select coalesce(json_agg(s), '[]') from season_history s where s.user_id = p_id)
  );
end;
$$;

-- Admins can't be banned, muted or kicked, so the panel can't lock its own owner out.
create or replace function public.admin_target(p_user uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = p_user) then raise exception 'player not found'; end if;
  if exists (select 1 from admins where user_id = p_user) then raise exception 'admins cannot be moderated'; end if;
end;
$$;

create or replace function public.admin_ban(p_user uuid, p_minutes int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare until timestamptz := case when p_minutes is null or p_minutes <= 0 then 'infinity'::timestamptz else now() + make_interval(mins => p_minutes) end;
begin
  perform admin_guard(); perform admin_target(p_user);
  insert into moderation (user_id, banned_until, ban_reason, kick_at, kick_reason, updated_at) values (p_user, until, left(p_reason, 300), now(), 'Banned', now())
  on conflict (user_id) do update set banned_until = until, ban_reason = left(p_reason, 300), kick_at = now(), kick_reason = 'Banned', updated_at = now();
  perform admin_log('ban', p_user::text, json_build_object('minutes', p_minutes, 'reason', p_reason)::jsonb);
end;
$$;

create or replace function public.admin_unban(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  update moderation set banned_until = null, ban_reason = null, updated_at = now() where user_id = p_user;
  perform admin_log('unban', p_user::text, null);
end;
$$;

create or replace function public.admin_mute(p_user uuid, p_minutes int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare until timestamptz := case when p_minutes is null or p_minutes <= 0 then 'infinity'::timestamptz else now() + make_interval(mins => p_minutes) end;
begin
  perform admin_guard(); perform admin_target(p_user);
  insert into moderation (user_id, muted_until, mute_reason, updated_at) values (p_user, until, left(p_reason, 300), now())
  on conflict (user_id) do update set muted_until = until, mute_reason = left(p_reason, 300), updated_at = now();
  perform admin_log('mute', p_user::text, json_build_object('minutes', p_minutes, 'reason', p_reason)::jsonb);
end;
$$;

create or replace function public.admin_unmute(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  update moderation set muted_until = null, mute_reason = null, updated_at = now() where user_id = p_user;
  perform admin_log('unmute', p_user::text, null);
end;
$$;

create or replace function public.admin_kick(p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard(); perform admin_target(p_user);
  insert into moderation (user_id, kick_at, kick_reason, updated_at) values (p_user, now(), left(p_reason, 300), now())
  on conflict (user_id) do update set kick_at = now(), kick_reason = left(p_reason, 300), updated_at = now();
  perform admin_log('kick', p_user::text, json_build_object('reason', p_reason)::jsonb);
end;
$$;

create or replace function public.admin_warn(p_user uuid, p_message text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard(); perform admin_target(p_user);
  if coalesce(trim(p_message), '') = '' then raise exception 'empty message'; end if;
  insert into warnings (user_id, message) values (p_user, left(p_message, 500));
  perform admin_log('warn', p_user::text, json_build_object('message', p_message)::jsonb);
end;
$$;

create or replace function public.admin_rename(p_user uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare old text;
begin
  perform admin_guard();
  if p_name !~ '^[A-Za-z0-9_]{3,16}$' then raise exception 'usernames are 3-16 letters, numbers or _'; end if;
  if exists (select 1 from profiles where lower(username) = lower(p_name) and id <> p_user) then raise exception 'that username is taken'; end if;
  select username into old from profiles where id = p_user;
  update profiles set username = p_name where id = p_user;
  perform admin_log('rename', p_user::text, json_build_object('from', old, 'to', p_name)::jsonb);
end;
$$;

-- Sets any of the listed stat columns from a JSON object, e.g. {"elo": 1200, "xp": 5000}.
create or replace function public.admin_set_stats(p_user uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare col text; allowed text[] := array['elo','peak_elo','ranked_wins','ranked_losses','wins','losses','matches','kills','deaths','headshots','xp','pass_xp','season_wins','season_losses','season_peak'];
begin
  perform admin_guard();
  for col in select jsonb_object_keys(p_patch) loop
    if not col = any(allowed) then raise exception 'cannot set %', col; end if;
    execute format('update profiles set %I = greatest(0, $1) where id = $2', col) using (p_patch ->> col)::int, p_user;
  end loop;
  perform admin_log('set_stats', p_user::text, p_patch);
end;
$$;

create or replace function public.admin_reset_stats(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  update profiles set elo = 1000, peak_elo = 1000, ranked_wins = 0, ranked_losses = 0, wins = 0, losses = 0, matches = 0,
    kills = 0, deaths = 0, headshots = 0, xp = 0, pass_xp = 0, season_wins = 0, season_losses = 0, season_peak = 1000 where id = p_user;
  perform admin_log('reset_stats', p_user::text, null);
end;
$$;

create or replace function public.admin_grant_item(p_user uuid, p_kind text, p_item text, p_revoke boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  if p_kind not in ('finish', 'outfit', 'card', 'effect', 'emote') then raise exception 'invalid item kind'; end if;
  insert into item_grants (user_id, kind, item, revoke) values (p_user, p_kind, left(p_item, 40), coalesce(p_revoke, false));
  perform admin_log(case when p_revoke then 'revoke_item' else 'grant_item' end, p_user::text, json_build_object('kind', p_kind, 'item', p_item)::jsonb);
end;
$$;

-- Undoes a ranked result: reverses both players' rating change and win/loss counts. Season counts
-- only change if the match was played in the current season. The result stays recorded as voided so
-- it can't be reported again.
create or replace function public.admin_void_ranked(p_match_id text)
returns void language plpgsql security definer set search_path = public as $$
declare r ranked_matches%rowtype; this_season boolean;
begin
  perform admin_guard();
  select * into r from ranked_matches where match_id = p_match_id for update;
  if not found then raise exception 'no ranked result for that match'; end if;
  if r.voided then raise exception 'that result is already voided'; end if;
  this_season := r.created_at >= coalesce((select starts_at from seasons where id = current_season()), 'infinity');
  update profiles set elo = greatest(0, elo - r.winner_delta), ranked_wins = greatest(0, ranked_wins - 1),
    season_wins = case when this_season then greatest(0, season_wins - 1) else season_wins end where id = r.winner;
  update profiles set elo = elo - r.loser_delta, ranked_losses = greatest(0, ranked_losses - 1),
    season_losses = case when this_season then greatest(0, season_losses - 1) else season_losses end where id = r.loser;
  update ranked_matches set voided = true where match_id = p_match_id;
  update match_history set elo_change = 0, score = coalesce(score, '') || ' (voided)' where match_id = p_match_id and ranked;
  perform admin_log('void_ranked', p_match_id, row_to_json(r)::jsonb);
end;
$$;

create or replace function public.admin_moderated(p_limit int default 200)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  return (select coalesce(json_agg(row_to_json(t)), '[]') from (
    select m.*, p.username from moderation m join profiles p on p.id = m.user_id
    where m.banned_until > now() or m.muted_until > now() order by m.updated_at desc limit least(p_limit, 500)) t);
end;
$$;

create or replace function public.admin_announce(p_message text, p_hours numeric, p_kind text default 'info')
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  insert into announcements (message, kind, ends_at, created_by) values (left(p_message, 300), p_kind, now() + make_interval(secs => (greatest(0.1, p_hours) * 3600)::double precision), auth.uid());
  perform admin_log('announce', null, json_build_object('message', p_message, 'hours', p_hours, 'kind', p_kind)::jsonb);
end;
$$;

create or replace function public.admin_end_announcement(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  update announcements set ends_at = now() where id = p_id;
  perform admin_log('end_announcement', p_id::text, null);
end;
$$;

create or replace function public.admin_announcements()
returns json language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  return (select coalesce(json_agg(a order by a.id desc), '[]') from (select * from announcements order by id desc limit 50) a);
end;
$$;

create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  if p_key not in ('maintenance', 'motd', 'xp_boost') then raise exception 'unknown setting'; end if;
  insert into app_settings (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  perform admin_log('set_setting', p_key, p_value);
end;
$$;

create or replace function public.admin_audit_log(p_limit int default 100)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  return (select coalesce(json_agg(row_to_json(t)), '[]') from (
    select a.*, p.username as target_name from admin_audit a left join profiles p on p.id::text = a.target
    order by a.id desc limit least(p_limit, 500)) t);
end;
$$;

-- Puts a map in a featured slot (1-2 small, 3-4 large), replacing whatever was there, or takes it
-- out (p_slot null).
create or replace function public.admin_feature_map(p_id bigint, p_slot int)
returns void language plpgsql security definer set search_path = public as $$
declare sz text;
begin
  perform admin_guard();
  select size into sz from custom_maps where id = p_id;
  if not found then raise exception 'map not found'; end if;
  if p_slot is not null then
    if p_slot not between 1 and 4 then raise exception 'slots are 1-4'; end if;
    if (p_slot <= 2) <> (sz = 'small') then raise exception 'slots 1-2 are for small maps, 3-4 for large maps'; end if;
    update custom_maps set featured_slot = null where featured_slot = p_slot and id <> p_id;
  end if;
  update custom_maps set featured_slot = p_slot where id = p_id;
  perform admin_log(case when p_slot is null then 'unfeature_map' else 'feature_map' end, p_id::text, json_build_object('slot', p_slot)::jsonb);
end;
$$;

create or replace function public.admin_delete_map(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare m custom_maps%rowtype;
begin
  perform admin_guard();
  delete from custom_maps where id = p_id returning * into m;
  perform admin_log('delete_map', p_id::text, json_build_object('name', m.name, 'owner', m.owner)::jsonb);
end;
$$;

create or replace function public.admin_feedback(p_status text default 'open', p_limit int default 100)
returns json language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  return (select coalesce(json_agg(row_to_json(t)), '[]') from (
    select f.*, p.username from feedback f join profiles p on p.id = f.user_id
    where p_status = 'all' or f.status = p_status order by f.created_at desc limit least(p_limit, 500)) t);
end;
$$;

create or replace function public.admin_resolve_feedback(p_id bigint, p_status text, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_guard();
  if p_status not in ('open', 'resolved') then raise exception 'invalid status'; end if;
  update feedback set status = p_status, admin_note = left(p_note, 500), resolved_at = case when p_status = 'resolved' then now() end where id = p_id;
  perform admin_log('resolve_feedback', p_id::text, json_build_object('status', p_status, 'note', p_note)::jsonb);
end;
$$;

-- ───────────── function permissions ─────────────
-- Internal helpers are not callable from the app at all.
revoke all on function public.ensure_season(uuid) from public, anon, authenticated;
revoke all on function public.admin_guard() from public, anon, authenticated;
revoke all on function public.admin_log(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.admin_target(uuid) from public, anon, authenticated;
revoke all on function public.is_banned(uuid) from public, anon, authenticated;
-- The sign-up trigger only ever runs as a trigger, never through the API.
revoke all on function public.handle_new_user() from public, anon, authenticated;

revoke all on function public.current_season() from public;
grant execute on function public.current_season() to anon, authenticated;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
revoke all on function public.moderation_flags(uuid[]) from public, anon;
grant execute on function public.moderation_flags(uuid[]) to authenticated;
revoke all on function public.player_commends(uuid) from public;
grant execute on function public.player_commends(uuid) to anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'my_status()', 'ack_status(bigint[], bigint[])', 'commend_player(uuid, text, text)',
    'report_player(uuid, text, text, text, text, jsonb)', 'claim_challenge(text)',
    'friend_request(uuid)', 'friend_respond(uuid, boolean)', 'friend_remove(uuid)', 'my_friends()',
    'save_custom_map(bigint, text, text, text, jsonb)', 'delete_custom_map(bigint)', 'like_custom_map(bigint, boolean)', 'my_map_likes()',
    'admin_feature_map(bigint, int)', 'admin_delete_map(bigint)',
    'submit_feedback(text, text, jsonb)', 'admin_feedback(text, int)', 'admin_resolve_feedback(bigint, text, text)',
    'admin_overview()', 'admin_reports(text, int)', 'admin_resolve_report(bigint, text, text)', 'admin_player(uuid)',
    'admin_ban(uuid, int, text)', 'admin_unban(uuid)', 'admin_mute(uuid, int, text)', 'admin_unmute(uuid)',
    'admin_kick(uuid, text)', 'admin_warn(uuid, text)', 'admin_rename(uuid, text)', 'admin_set_stats(uuid, jsonb)',
    'admin_reset_stats(uuid)', 'admin_grant_item(uuid, text, text, boolean)', 'admin_void_ranked(text)',
    'admin_moderated(int)', 'admin_announce(text, numeric, text)', 'admin_end_announcement(bigint)',
    'admin_announcements()', 'admin_set_setting(text, jsonb)', 'admin_audit_log(int)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

revoke all on function public.report_ranked(text, uuid, uuid) from public, anon;
revoke all on function public.record_match(text, text, text, boolean, boolean, text, int, int, int, text, int, jsonb) from public, anon;
grant execute on function public.report_ranked(text, uuid, uuid) to authenticated;
grant execute on function public.record_match(text, text, text, boolean, boolean, text, int, int, int, text, int, jsonb) to authenticated;
