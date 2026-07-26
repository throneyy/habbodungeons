-- ============================================================ duels
-- Two-party duel challenge handshake, the trade table's sibling (see `trades`
-- in 20260725000000_v2_backend.sql). Same shape, same guarantees:
--   • writes ONLY through the duel-* edge functions (service role) — clients
--     get SELECT on their own rows, so nobody can put themselves in a duel,
--     skip the countdown or restart it by writing the table directly;
--   • one live row per pair, statuses 'asked' → 'countdown' → 'cancelled'/'done'.
--
-- starts_at is the SYNC ANCHOR: written once, on the challenger's row, when the
-- target accepts. Both clients tick the 3-2-1-GO off that single absolute
-- instant (js/duelCountdown.js), so neither side can be a beat ahead — there is
-- no per-client "start now" and no server tick loop.
--
-- No combat yet: the countdown lands in a 'ready' state (derived on the client
-- from starts_at) that either side can cancel out of.
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
alter table public.duels enable row level security;
create index if not exists duels_users_idx on public.duels (a_user, b_user);
create index if not exists duels_status_idx on public.duels (status);

do $$ begin
  create policy "duels party read" on public.duels
    for select to authenticated using (auth.uid() in (a_user, b_user));
exception when duplicate_object then null; end $$;

-- Stream duel rows to the two participants (the prompts themselves ride the
-- user:<id> broadcast mailbox; this is the durable mirror, as with trades).
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

-- DELETE/UPDATE events must carry the full old row: clients key off the pair's
-- names when a duel is cancelled (same reason trades replicate full).
alter table public.duels replica identity full;
