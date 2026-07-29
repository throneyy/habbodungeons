-- ============================================================ skill_snapshots
-- Per-day history for Origins skill levels, so "gained today" leaderboards can
-- exist at all.
--
-- WHY: profiles carries only the CURRENT fishing_level/gardening_level plus
-- last_habbo_skill_sync. A current level answers "who is the best angler", but
-- it cannot answer "who gained the most today" -- there is nothing to subtract
-- from. This table is the missing half: the same two numbers, stamped with a
-- time, appended rather than overwritten.
--
-- SOURCE IS ALREADY SOLVED. supabase/functions/_shared/habbo.ts already returns
-- fishingLevel/gardeningLevel as JSON from bobba.me (the only source that
-- carries them; Origins-direct returns 0 for both). Nothing here scrapes, and
-- nothing here needs a new upstream -- only storage was missing.
--
-- STORAGE ONLY. No cron and no UI in this migration; the writer is a separate
-- step. Rows are written by the service_role from an edge function.

create table if not exists public.skill_snapshots (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  fishing_level int not null default 0,
  gardening_level int not null default 0,
  captured_at timestamptz not null default now(),

  -- Retry safety: a cron that double-fires, or an edge function that is
  -- retried after a timeout, must not append a second row for the same instant
  -- and inflate a delta. Gives `on conflict (user_id, captured_at) do nothing`
  -- a target. Deliberately NOT a per-day constraint -- see the index notes.
  constraint skill_snapshots_user_at_key unique (user_id, captured_at)
);

alter table public.skill_snapshots enable row level security;

-- ---------------------------------------------------------------- indexes
-- The leaderboard question is "per user, the EARLIEST and the LATEST snapshot
-- inside a window", then latest.level - earliest.level, ordered by that delta.
--
-- The instinct is to lead with user_id, because user_id is the grouping key
-- that DISTINCT ON (user_id) / PARTITION BY user_id needs. THAT INSTINCT IS
-- WRONG HERE, and it was measured rather than argued
-- (tests/skillSnapshots.migration.mjs builds 730k rows and reads the plan):
--
--   a (user_id, captured_at DESC) INCLUDE (levels) covering index was added,
--   analyzed, and then IGNORED by the planner every time. Leading with user_id
--   means the window predicate cannot prune -- it has to walk all 730k entries
--   and filter captured_at inside each user's group. Pruning by time first and
--   sorting the survivors is dramatically cheaper, so that is what Postgres
--   picks. The covering index cost writes and storage and earned nothing, so
--   it is not created.
--
-- What the planner actually uses, and therefore what exists:
--
--   skill_snapshots_captured_at_idx  (captured_at DESC)
--     The workhorse. Every windowed board starts by pruning to the window --
--     `where captured_at >= now() - interval '24 hours'` -- and this turns
--     that into a range scan. Also the only index a retention sweep
--     (`delete where captured_at < now() - interval '90 days'`) can use, since
--     a pure time predicate cannot use a user-leading index.
--
--   skill_snapshots_user_at_key      (user_id, captured_at ASC)
--     Created by the unique constraint above, so it is already paid for. Earns
--     its keep twice: the retry guard, and per-user history ("show me MY
--     progress"), which is the one shape that genuinely leads with user_id.
--
-- After the window prunes, the per-user endpoints are found by sorting the
-- survivors on (user_id, captured_at) -- a few thousand rows for a day's
-- window, ~3ms of a 40ms query at 730k rows, and far less at this project's
-- real scale. Both endpoints come out of that single sort, so neither one
-- needs an index of its own.
create index if not exists skill_snapshots_captured_at_idx
  on public.skill_snapshots (captured_at desc);

-- ---------------------------------------------------------------- RLS
-- Readable by anyone, exactly as profiles is: the title screen's leaderboards
-- render for signed-out visitors, so anon must be able to SELECT. This mirrors
-- the "Public can view profiles" policy (20251119193847) -- TO public, which
-- covers anon and authenticated alike.
--
-- A snapshot is (user_id, two public skill levels, a timestamp). The levels are
-- already public on profiles and on the player's own Habbo profile, so this
-- exposes nothing that profiles does not.
do $$ begin
  create policy "Public can view skill snapshots" on public.skill_snapshots
    for select to public using (true);
exception when duplicate_object then null; end $$;

-- No INSERT/UPDATE/DELETE policy on purpose. Snapshots are captured server-side
-- by the service_role (which bypasses RLS); a client must never be able to
-- write its own history, or the leaderboard becomes self-reported.

-- ---------------------------------------------------------------- grants
-- RLS decides WHICH ROWS; the grant decides whether the role may touch the
-- table at all. Both are required -- a policy alone leaves anon with
-- "permission denied for table". This matches the room_layouts precedent, the
-- project's other anon-readable table.
grant select on public.skill_snapshots to anon, authenticated;
grant all on public.skill_snapshots to service_role;
grant usage, select on sequence public.skill_snapshots_id_seq to service_role;

-- ---------------------------------------------------------------- comments
comment on table public.skill_snapshots is
  'Append-only history of Origins fishing/gardening levels. Enables "gained today" leaderboards, which profiles alone cannot answer. Written server-side only; read by anyone.';
comment on column public.skill_snapshots.user_id is
  'auth.users(id). Join to profiles(id) for habbo_username when rendering a board.';
comment on column public.skill_snapshots.fishing_level is
  'Origins fishing level at captured_at, from bobba.me via _shared/habbo.ts.';
comment on column public.skill_snapshots.gardening_level is
  'Origins gardening level at captured_at, from bobba.me via _shared/habbo.ts.';
comment on column public.skill_snapshots.captured_at is
  'When the reading was taken (not when the player levelled). Snapshot cadence is the cron''s choice; the indexes assume more than one per window.';
