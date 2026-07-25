-- V2 backend migration: everything the Node process (server.js, server/*.js,
-- /api/*, /ws) used to own is re-homed onto Postgres + RLS here. Tables the plan
-- marks "reused from V1" are created IF NOT EXISTS so this runs cleanly on both a
-- fresh Lovable project and one that already carries the V1 schema.
--
-- Auth model: auth.users is the identity. The old HMAC session token is gone —
-- every mutation edge function calls supabase.auth.getUser() and RLS keys on
-- auth.uid(). Multiplayer is gated on a linked Habbo (profiles.habbo_username).

-- ============================================================ extensions
create extension if not exists pgcrypto;      -- gen_random_uuid()
-- pg_cron is optional (presence-reap schedule) and not allowlisted on every
-- plan; never let its absence abort the migration.
do $$ begin
  create extension if not exists pg_cron;
exception when others then null; end $$;

-- ============================================================ roles / has_role
-- Standard Supabase role pattern: an enum + a user_roles table + a SECURITY
-- DEFINER has_role() so RLS policies never recurse through the table they gate.
do $$ begin
  create type public.app_role as enum ('admin', 'moderator', 'user');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

do $$ begin
  create policy "user_roles self read" on public.user_roles
    for select to authenticated using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- ============================================================ profiles
-- Mirrors what js/identity.js reads/writes. One row per auth user, auto-created
-- on signup by the trigger below.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  habbo_username text,
  habbo_unique_id text,
  habbo_figure text,
  habbo_motto text,
  habbo_verified_at timestamptz,
  habbo_profile_json jsonb,
  fishing_level int not null default 0,
  gardening_level int not null default 0,
  unlocked_skills jsonb not null default '[]'::jsonb,
  last_habbo_skill_sync timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- A player's own name/figure/motto is public-ish inside the game (rosters,
-- infostands render other players), so SELECT is open to authenticated users.
do $$ begin
  create policy "profiles readable by authed" on public.profiles
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "profiles self upsert" on public.profiles
    for insert to authenticated with check (auth.uid() = id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "profiles self update" on public.profiles
    for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
exception when duplicate_object then null; end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================ rate_limits
-- Per-invocation abuse guard (the closest stateless analogue to the ws hub's
-- strike counter). Edge functions call public.rate_limit_touch() before mutating.
create table if not exists public.rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  last_at timestamptz not null default now(),
  primary key (user_id, action)
);
alter table public.rate_limits enable row level security;
-- No client policies: only edge functions (service role) touch this table.

-- Returns true when the action is ALLOWED (>= min_interval since last time),
-- and stamps the new time. Rejects (false) when called too soon.
create or replace function public.rate_limit_touch(_user_id uuid, _action text, _min_interval interval)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _last timestamptz;
begin
  select last_at into _last from public.rate_limits
    where user_id = _user_id and action = _action for update;
  if _last is not null and now() - _last < _min_interval then
    return false;
  end if;
  insert into public.rate_limits (user_id, action, last_at)
    values (_user_id, _action, now())
    on conflict (user_id, action) do update set last_at = now();
  return true;
end;
$$;

-- ============================================================ inventory / stash
-- The persistent between-runs loot vault (server/stash.js). One row per item;
-- trade swaps just reassign user_id inside a SECURITY DEFINER function so the
-- exchange is atomic. gold lives on profiles-adjacent stash_gold to avoid a
-- separate table.
create table if not exists public.inventory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null,
  created_at timestamptz not null default now()
);
alter table public.inventory enable row level security;
create index if not exists inventory_user_idx on public.inventory (user_id);

do $$ begin
  create policy "inventory self read" on public.inventory
    for select to authenticated using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
-- Writes go through edge functions (item-id allowlist + trade swap); deny direct
-- client inserts/updates so loot can't be minted or moved by a crafted request.

create table if not exists public.stash_gold (
  user_id uuid primary key references auth.users (id) on delete cascade,
  gold bigint not null default 0
);
alter table public.stash_gold enable row level security;
do $$ begin
  create policy "stash_gold self read" on public.stash_gold
    for select to authenticated using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- ============================================================ room_presence
-- Live Free Roam roster. RLS lets any authed user see who's in a room; each user
-- only writes their own row. Stale rows are reaped by presence-reap (cron).
create table if not exists public.room_presence (
  user_id uuid primary key references auth.users (id) on delete cascade,
  room_id text not null,
  name text not null,
  figure text not null default '',
  x int not null default 0,
  y int not null default 0,
  dir int not null default 4,
  last_seen timestamptz not null default now()
);
alter table public.room_presence enable row level security;
create index if not exists room_presence_room_idx on public.room_presence (room_id);

do $$ begin
  create policy "presence readable by authed" on public.room_presence
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "presence self insert" on public.room_presence
    for insert to authenticated with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "presence self update" on public.room_presence
    for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "presence self delete" on public.room_presence
    for delete to authenticated using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- ============================================================ room_messages
-- Optional chat persistence (Free Roam say/shout/whisper). Movement/chat also
-- ride Realtime broadcast for latency; this table is the durable log.
create table if not exists public.room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  text text not null,
  mode text not null default 'say' check (mode in ('say', 'shout', 'whisper')),
  created_at timestamptz not null default now()
);
alter table public.room_messages enable row level security;
create index if not exists room_messages_room_idx on public.room_messages (room_id, created_at desc);

do $$ begin
  create policy "messages readable by authed" on public.room_messages
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "messages self insert" on public.room_messages
    for insert to authenticated
    with check (auth.uid() = user_id and char_length(text) between 1 and 100);
exception when duplicate_object then null; end $$;

-- ============================================================ parties
-- ≤4 players, room-scoped. Leader + members; invites carry a TTL. Writes go
-- through the party-* edge functions (leader-only rules, crown handoff), so
-- clients get SELECT only.
create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  leader_id uuid not null references auth.users (id) on delete cascade,
  room_id text,
  created_at timestamptz not null default now()
);
alter table public.parties enable row level security;

create table if not exists public.party_members (
  party_id uuid not null references public.parties (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  figure text not null default '',
  joined_at timestamptz not null default now(),
  primary key (party_id, user_id)
);
alter table public.party_members enable row level security;
create index if not exists party_members_user_idx on public.party_members (user_id);

create table if not exists public.party_invites (
  id uuid primary key default gen_random_uuid(),
  party_id uuid references public.parties (id) on delete cascade,
  from_user uuid not null references auth.users (id) on delete cascade,
  from_name text not null,
  to_user uuid not null references auth.users (id) on delete cascade,
  room_id text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.party_invites enable row level security;
create index if not exists party_invites_to_idx on public.party_invites (to_user);

-- A member can see their own party's roster; SELECT via a membership check.
create or replace function public.in_party(_party_id uuid, _user_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.party_members
    where party_id = _party_id and user_id = _user_id
  );
$$;

do $$ begin
  create policy "parties member read" on public.parties
    for select to authenticated using (public.in_party(id, auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "party_members member read" on public.party_members
    for select to authenticated using (public.in_party(party_id, auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "party_invites party read" on public.party_invites
    for select to authenticated using (auth.uid() in (from_user, to_user));
exception when duplicate_object then null; end $$;

-- ============================================================ trades
-- Two-party Origins-style trade. Writes ONLY through trade-* edge functions +
-- the SECURITY DEFINER swap below, so the anti-scam invariant (any offer change
-- resets both accepts) can't be bypassed by a direct client write.
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  a_user uuid not null references auth.users (id) on delete cascade,
  b_user uuid not null references auth.users (id) on delete cascade,
  a_name text not null,
  b_name text not null,
  room_id text,
  stage text not null default 'offer' check (stage in ('asked', 'offer', 'confirm')),
  a_accepted boolean not null default false,
  b_accepted boolean not null default false,
  a_confirmed boolean not null default false,
  b_confirmed boolean not null default false,
  status text not null default 'active' check (status in ('asked', 'active', 'done', 'cancelled')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.trades enable row level security;
create index if not exists trades_users_idx on public.trades (a_user, b_user);

create table if not exists public.trade_offers (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  inventory_id uuid not null references public.inventory (id) on delete cascade,
  item_id text not null,
  created_at timestamptz not null default now()
);
alter table public.trade_offers enable row level security;
create index if not exists trade_offers_trade_idx on public.trade_offers (trade_id);

do $$ begin
  create policy "trades party read" on public.trades
    for select to authenticated using (auth.uid() in (a_user, b_user));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "trade_offers party read" on public.trade_offers
    for select to authenticated using (
      exists (
        select 1 from public.trades t
        where t.id = trade_id and auth.uid() in (t.a_user, t.b_user)
      )
    );
exception when duplicate_object then null; end $$;

-- The atomic double-confirm swap (server/stash.js applySwap). Reassigns the
-- offered inventory rows to the other side in one transaction, verifying each
-- side still owns exactly what it offered. Raises (rolls back) on any mismatch,
-- so a partial swap can never happen. Callable only by the service role.
create or replace function public.execute_trade(_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _t public.trades;
  _bad int;
begin
  select * into _t from public.trades where id = _trade_id for update;
  if _t.id is null then raise exception 'no such trade'; end if;
  if _t.status <> 'active' then raise exception 'trade not active'; end if;
  if not (_t.a_confirmed and _t.b_confirmed) then
    raise exception 'both sides must confirm';
  end if;

  -- Every offered row must still belong to the user who offered it.
  select count(*) into _bad
  from public.trade_offers o
  join public.inventory i on i.id = o.inventory_id
  where o.trade_id = _trade_id and i.user_id <> o.user_id;
  if _bad > 0 then raise exception 'offer not covered by inventory'; end if;

  -- Reassign each offered item to the OTHER party.
  update public.inventory i
  set user_id = case when o.user_id = _t.a_user then _t.b_user else _t.a_user end
  from public.trade_offers o
  where o.trade_id = _trade_id and o.inventory_id = i.id;

  update public.trades set status = 'done', stage = 'confirm', updated_at = now()
  where id = _trade_id;
end;
$$;

-- ============================================================ room_layouts
-- Furniture layouts edited in-game (Free Roam room editor, /api/admin/layout).
-- Reading is public to authed users; only admins write (mirrors V1
-- grid_configurations). Bumping version pushes clients to refetch + rebuild.
create table if not exists public.room_layouts (
  id uuid primary key default gen_random_uuid(),
  room_id text not null unique,
  layout jsonb not null default '[]'::jsonb,
  version int not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.room_layouts enable row level security;

-- Layouts are public room art: readable by anon guests too (they play solo-local
-- and still see the arranged furniture), not just signed-in players.
do $$ begin
  create policy "layouts readable by anyone" on public.room_layouts
    for select to anon, authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "layouts admin write" on public.room_layouts
    for all to authenticated
    using (public.has_role(auth.uid(), 'admin'))
    with check (public.has_role(auth.uid(), 'admin'));
exception when duplicate_object then null; end $$;

-- ============================================================ battle_states
-- Co-op turn-based battle authority (V1 resolve-turn model). Kept minimal here;
-- the descent flow can also run leader-relay over Realtime broadcast (path B).
create table if not exists public.battle_states (
  id uuid primary key default gen_random_uuid(),
  party_id uuid references public.parties (id) on delete cascade,
  dungeon_id text not null,
  state jsonb not null default '{}'::jsonb,
  current_turn_user_id uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.battle_states enable row level security;
do $$ begin
  create policy "battle_states party read" on public.battle_states
    for select to authenticated using (party_id is null or public.in_party(party_id, auth.uid()));
exception when duplicate_object then null; end $$;

-- ============================================================ realtime
-- Enable postgres_changes streaming on the tables clients subscribe to. broadcast
-- (movement/chat/relay) needs no publication — it's an ephemeral peer relay.
do $$
declare t text;
begin
  foreach t in array array[
    'room_presence', 'room_messages', 'party_members', 'party_invites',
    'parties', 'trades', 'trade_offers', 'room_layouts', 'battle_states'
  ] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    when undefined_object then
      -- publication doesn't exist yet on a bare Postgres: create it first.
      execute 'create publication supabase_realtime';
      execute format('alter publication supabase_realtime add table public.%I', t);
    end;
  end loop;
end $$;

-- postgres_changes DELETE/UPDATE events only carry the changed columns unless
-- the table replicates its full old row. Clients key off names on delete
-- (party members leaving, invites declined, trades cancelled), so replicate full.
do $$
declare t text;
begin
  foreach t in array array[
    'room_presence', 'party_members', 'party_invites', 'trades', 'trade_offers'
  ] loop
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;

-- ============================================================ realtime authz
-- Realtime Authorization (RLS on realtime.messages) gates who may subscribe to
-- and broadcast on each channel topic. Private topics:
--   user:<uuid>   the caller's personal mailbox (invites, trade-state, prompts)
--   party:<uuid>  co-op relay, limited to party members
-- Room topics (room:<id>) stay open to any authed player (anyone may enter any
-- room legitimately). Service-role broadcasts from edge functions bypass RLS.
do $$ begin
  create policy "realtime read own topics" on realtime.messages
    for select to authenticated using (
      realtime.topic() like 'room:%'
      or realtime.topic() = 'user:' || auth.uid()::text
      or (
        realtime.topic() like 'party:%'
        and public.in_party(
          nullif(split_part(realtime.topic(), ':', 2), '')::uuid, auth.uid())
      )
    );
exception when duplicate_object then null; when undefined_table then null; end $$;

do $$ begin
  create policy "realtime write allowed topics" on realtime.messages
    for insert to authenticated with check (
      realtime.topic() like 'room:%'
      or (
        realtime.topic() like 'party:%'
        and public.in_party(
          nullif(split_part(realtime.topic(), ':', 2), '')::uuid, auth.uid())
      )
    );
exception when duplicate_object then null; when undefined_table then null; end $$;

-- ============================================================ presence reaper
-- Evict presence rows older than the TTL (the ws ping/terminate reaper). Run by
-- the presence-reap edge function on a cron, or directly via pg_cron below.
create or replace function public.reap_stale_presence(_ttl interval default interval '30 seconds')
returns int
language plpgsql
security definer
set search_path = public
as $$
declare _n int;
begin
  delete from public.room_presence where last_seen < now() - _ttl;
  get diagnostics _n = row_count;
  return _n;
end;
$$;

-- Best-effort pg_cron schedule (no-op if pg_cron isn't available on the plan).
do $$ begin
  perform cron.schedule('reap-stale-presence', '15 seconds', $cron$ select public.reap_stale_presence() $cron$);
exception when others then null; end $$;
