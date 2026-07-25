-- V2 REPLACEMENT PREAMBLE: drop V1-only tables and schema-incompatible tables so
-- the V2 CREATE IF NOT EXISTS blocks below actually build V2 shapes.
drop trigger if exists on_auth_user_created on auth.users cascade;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.is_party_member(uuid, uuid) cascade;
drop function if exists public.is_party_leader(uuid, uuid) cascade;
drop function if exists public.can_view_party_members(uuid, uuid) cascade;
drop function if exists public.generate_invite_code() cascade;
drop table if exists public.verification_attempts cascade;
drop table if exists public.daily_stats cascade;
drop table if exists public.player_stats cascade;
drop table if exists public.server_players cascade;
drop table if exists public.servers cascade;
drop table if exists public.enemy_sprites cascade;
drop table if exists public.generated_icons cascade;
drop table if exists public.grid_configurations cascade;
drop table if exists public.battle_states cascade;
drop table if exists public.dungeons cascade;
drop table if exists public.party_members cascade;
drop table if exists public.parties cascade;
drop table if exists public.inventory cascade;
drop table if exists public.rate_limits cascade;
drop table if exists public.profiles cascade;

-- ============================================================ extensions
create extension if not exists pgcrypto;
do $$ begin
  create extension if not exists pg_cron;
exception when others then null; end $$;

-- ============================================================ roles / has_role
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
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

do $$ begin
  create policy "user_roles self read" on public.user_roles
    for select to authenticated using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

-- ============================================================ profiles
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
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ============================================================ rate_limits
create table if not exists public.rate_limits (
  user_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  last_at timestamptz not null default now(),
  primary key (user_id, action)
);
alter table public.rate_limits enable row level security;

create or replace function public.rate_limit_touch(_user_id uuid, _action text, _min_interval interval)
returns boolean language plpgsql security definer set search_path = public as $$
declare _last timestamptz;
begin
  select last_at into _last from public.rate_limits where user_id = _user_id and action = _action for update;
  if _last is not null and now() - _last < _min_interval then return false; end if;
  insert into public.rate_limits (user_id, action, last_at) values (_user_id, _action, now())
    on conflict (user_id, action) do update set last_at = now();
  return true;
end;
$$;

-- ============================================================ inventory / stash
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
    for insert to authenticated with check (auth.uid() = user_id and char_length(text) between 1 and 100);
exception when duplicate_object then null; end $$;

-- ============================================================ parties
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

create or replace function public.in_party(_party_id uuid, _user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.party_members where party_id = _party_id and user_id = _user_id);
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
    for select to authenticated using (exists (
      select 1 from public.trades t where t.id = trade_id and auth.uid() in (t.a_user, t.b_user)
    ));
exception when duplicate_object then null; end $$;

create or replace function public.execute_trade(_trade_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare _t public.trades; _bad int;
begin
  select * into _t from public.trades where id = _trade_id for update;
  if _t.id is null then raise exception 'no such trade'; end if;
  if _t.status <> 'active' then raise exception 'trade not active'; end if;
  if not (_t.a_confirmed and _t.b_confirmed) then raise exception 'both sides must confirm'; end if;
  select count(*) into _bad from public.trade_offers o
    join public.inventory i on i.id = o.inventory_id
    where o.trade_id = _trade_id and i.user_id <> o.user_id;
  if _bad > 0 then raise exception 'offer not covered by inventory'; end if;
  update public.inventory i
    set user_id = case when o.user_id = _t.a_user then _t.b_user else _t.a_user end
    from public.trade_offers o where o.trade_id = _trade_id and o.inventory_id = i.id;
  update public.trades set status = 'done', stage = 'confirm', updated_at = now() where id = _trade_id;
end;
$$;

-- ============================================================ room_layouts
create table if not exists public.room_layouts (
  id uuid primary key default gen_random_uuid(),
  room_id text not null unique,
  layout jsonb not null default '[]'::jsonb,
  version int not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.room_layouts enable row level security;

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
      execute 'create publication supabase_realtime';
      execute format('alter publication supabase_realtime add table public.%I', t);
    end;
  end loop;
end $$;

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
do $$ begin
  create policy "realtime read own topics" on realtime.messages
    for select to authenticated using (
      realtime.topic() like 'room:%'
      or realtime.topic() = 'user:' || auth.uid()::text
      or (
        realtime.topic() like 'party:%'
        and public.in_party(nullif(split_part(realtime.topic(), ':', 2), '')::uuid, auth.uid())
      )
    );
exception when duplicate_object then null; when undefined_table then null; end $$;

do $$ begin
  create policy "realtime write allowed topics" on realtime.messages
    for insert to authenticated with check (
      realtime.topic() like 'room:%'
      or (
        realtime.topic() like 'party:%'
        and public.in_party(nullif(split_part(realtime.topic(), ':', 2), '')::uuid, auth.uid())
      )
    );
exception when duplicate_object then null; when undefined_table then null; end $$;

-- ============================================================ presence reaper
create or replace function public.reap_stale_presence(_ttl interval default interval '30 seconds')
returns int language plpgsql security definer set search_path = public as $$
declare _n int;
begin
  delete from public.room_presence where last_seen < now() - _ttl;
  get diagnostics _n = row_count;
  return _n;
end;
$$;

do $$ begin
  perform cron.schedule('reap-stale-presence', '15 seconds', $cron$ select public.reap_stale_presence() $cron$);
exception when others then null; end $$;

-- ============================================================ Data API grants
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
grant all on public.rate_limits to service_role;
grant select on public.inventory to authenticated;
grant all on public.inventory to service_role;
grant select on public.stash_gold to authenticated;
grant all on public.stash_gold to service_role;
grant select, insert, update, delete on public.room_presence to authenticated;
grant all on public.room_presence to service_role;
grant select, insert on public.room_messages to authenticated;
grant all on public.room_messages to service_role;
grant select on public.parties to authenticated;
grant all on public.parties to service_role;
grant select on public.party_members to authenticated;
grant all on public.party_members to service_role;
grant select on public.party_invites to authenticated;
grant all on public.party_invites to service_role;
grant select on public.trades to authenticated;
grant all on public.trades to service_role;
grant select on public.trade_offers to authenticated;
grant all on public.trade_offers to service_role;
grant select on public.room_layouts to anon, authenticated;
grant all on public.room_layouts to service_role;
grant select on public.battle_states to authenticated;
grant all on public.battle_states to service_role;