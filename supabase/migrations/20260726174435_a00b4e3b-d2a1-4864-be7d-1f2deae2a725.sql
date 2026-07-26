alter table public.profiles
  add column if not exists class_id text;

create table if not exists public.duels (
  id uuid primary key default gen_random_uuid(),
  a_user uuid not null references auth.users (id) on delete cascade,
  b_user uuid not null references auth.users (id) on delete cascade,
  a_name text not null,
  b_name text not null,
  room_id text not null,
  status text not null default 'asked'
    check (status in ('asked', 'countdown', 'done', 'cancelled')),
  starts_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
grant select on public.duels to authenticated;
grant all on public.duels to service_role;
alter table public.duels enable row level security;
create index if not exists duels_users_idx on public.duels (a_user, b_user);
create index if not exists duels_status_idx on public.duels (status);

do $$ begin
  create policy "duels party read" on public.duels
    for select to authenticated using (auth.uid() in (a_user, b_user));
exception when duplicate_object then null; end $$;

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.duels';
  exception when duplicate_object then null;
  when undefined_object then
    execute 'create publication supabase_realtime';
    execute 'alter publication supabase_realtime add table public.duels';
  end;
end $$;

alter table public.duels replica identity full;

update public.profiles t
   set habbo_username = null,
       updated_at = now()
 where t.id in (
   with ranked as (
     select
       id,
       row_number() over (
         partition by lower(btrim(habbo_username))
         order by updated_at desc nulls last, id
       ) as rn
     from public.profiles
     where habbo_username is not null
       and btrim(habbo_username) <> ''
   )
   select p.id
     from ranked r
     join public.profiles p on p.id = r.id
    where r.rn > 1
      and (
        p.habbo_unique_id is not null
        or p.habbo_motto is not null
        or p.habbo_profile_json is not null
        or coalesce(p.fishing_level, 0) <> 0
        or coalesce(p.gardening_level, 0) <> 0
        or coalesce(jsonb_array_length(p.unlocked_skills), 0) <> 0
        or coalesce(to_jsonb(p) ->> 'class_id', '') <> ''
        or exists (select 1 from public.party_members m where m.user_id = p.id)
        or exists (select 1 from public.inventory i where i.user_id = p.id)
        or exists (select 1 from public.stash_gold g where g.user_id = p.id)
      )
 );

delete from public.profiles t
 where t.id in (
   with ranked as (
     select
       id,
       row_number() over (
         partition by lower(btrim(habbo_username))
         order by updated_at desc nulls last, id
       ) as rn
     from public.profiles
     where habbo_username is not null
       and btrim(habbo_username) <> ''
   )
   select p.id
     from ranked r
     join public.profiles p on p.id = r.id
    where r.rn > 1
      and not (
        p.habbo_unique_id is not null
        or p.habbo_motto is not null
        or p.habbo_profile_json is not null
        or coalesce(p.fishing_level, 0) <> 0
        or coalesce(p.gardening_level, 0) <> 0
        or coalesce(jsonb_array_length(p.unlocked_skills), 0) <> 0
        or coalesce(to_jsonb(p) ->> 'class_id', '') <> ''
        or exists (select 1 from public.party_members m where m.user_id = p.id)
        or exists (select 1 from public.inventory i where i.user_id = p.id)
        or exists (select 1 from public.stash_gold g where g.user_id = p.id)
      )
 );

create unique index if not exists profiles_habbo_username_lower_key
  on public.profiles (lower(btrim(habbo_username)))
  where habbo_username is not null and btrim(habbo_username) <> '';

comment on index public.profiles_habbo_username_lower_key is
  'One account per Habbo name, case-insensitive to match userByName''s ilike lookup (_shared/party.ts). Partial so unlinked accounts (NULL/empty name) are exempt.';