-- ============================================ profiles.habbo_username is a KEY
-- Two accounts could claim the same Habbo name, and that made BOTH of them
-- uninvitable.
--
-- Every party/trade/duel flow resolves its target by name through
-- supabase/functions/_shared/party.ts userByName():
--
--     .ilike("habbo_username", name).maybeSingle()
--
-- maybeSingle() is an ERROR on two or more matching rows (PostgREST PGRST116,
-- "JSON object requested, multiple (or no) rows returned") — not a pick-one.
-- userByName discarded that error and returned null, which party-invite
-- reports as { ok:false, reason:"no such player" }. So a perfectly healthy
-- account became invisible to invites the moment any second row claimed its
-- name, and the API's explanation pointed at the one thing that wasn't wrong.
-- Confirmed live: four profiles rows claiming two e2e names, both names
-- unresolvable, PGRST116 on every lookup.
--
-- Nothing prevented it: profiles' only key is `id` (the auth uid). The name was
-- load-bearing for lookups without ever being unique.
--
-- This migration makes the invariant real: one live row per name, enforced by
-- the database, case-insensitively (userByName matches with ilike, so `invb`
-- and `InvB` MUST collide — a plain unique(habbo_username) would let both exist
-- and leave the bug fully intact).

-- ---------------------------------------------------------------- 1. clean up
-- Resolve existing duplicates: newest claim per name wins.
--
-- "Newest" = updated_at desc, which is what identity.js mirror() and the e2e
-- seedProfile both stamp on every claim; ties break on id so the result is
-- deterministic rather than dependent on heap order.
--
-- The losers are then split, because "duplicate" must never mean "expendable":
--
--   • ORPHANS are deleted. A row is an orphan only if it carries no player
--     state of its own AND nothing else in the schema references it. These are
--     the abandoned shells the bug actually produced — an anon session that
--     signed up, claimed a name, and was never played (the e2e suite minting a
--     fresh anon user whenever its stored session was missing is exactly this).
--
--   • OCCUPIED losers keep their row and merely RELEASE THE NAME
--     (habbo_username := null). A duplicate name is not a good enough reason to
--     delete somebody's levels, skills, stash or party membership. They come
--     back as an unlinked account and re-link on next sign-in
--     (js/identity.js loadFromCloud → mirror), which is recoverable; a deleted
--     row is not.
--
-- habbo_verified_at is deliberately NOT treated as state: it timestamps the
-- name claim itself, so counting it would make every duplicate "occupied" and
-- clean up nothing.
--
-- class_id is read through to_jsonb() rather than named directly, because
-- 20260726000000_add_class_id_to_profiles.sql may not have been applied yet on
-- every project (it is absent from the live one as of writing). A missing
-- column would abort this whole migration at parse time; to_jsonb just yields
-- NULL for a key that isn't there.
-- The classification is spelled out in full in both statements below rather
-- than staged in a temp table, because a temp table would force an assumption
-- about how migrations are executed: CREATE TEMP ... ON COMMIT DROP only
-- survives inside an explicit transaction block, and outside one (statement-
-- per-transaction, which is how some runners apply files) it would vanish
-- before the next statement could read it. Each statement here stands alone.

-- Occupied losers FIRST: keep the row and the player, give up only the name.
-- Order matters. Releasing before deleting means the two statements see the
-- same ranking (a released row drops out of the duplicate set by having a NULL
-- name, and NULL-named rows are excluded from the ranking window entirely), so
-- the delete below cannot reinterpret a row this statement just spared.
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

-- Orphans: duplicate losers with nothing of value in them.
-- The auth.users row is untouched — this deletes the empty profile, not the
-- account, and handle_new_user() recreates a blank one on next sign-in.
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

-- ------------------------------------------------------------------ 2. the key
-- Case-insensitive, because userByName matches with ilike. lower() must be the
-- indexed expression itself or the constraint and the lookup disagree.
--
-- NULL-tolerant: the WHERE makes this a partial index, so the many accounts
-- with no linked Habbo name (every fresh anon session — handle_new_user()
-- inserts a bare row) don't collide with each other. Postgres already treats
-- NULLs as distinct in a unique index; the predicate also keeps them out of the
-- index entirely, and excludes the '' that a cleared name field can leave
-- behind.
--
-- NOT concurrently: Supabase runs migrations in a transaction, and CREATE INDEX
-- CONCURRENTLY cannot run inside one. The table is small (one row per account).
create unique index if not exists profiles_habbo_username_lower_key
  on public.profiles (lower(btrim(habbo_username)))
  where habbo_username is not null and btrim(habbo_username) <> '';

comment on index public.profiles_habbo_username_lower_key is
  'One account per Habbo name, case-insensitive to match userByName''s ilike lookup (_shared/party.ts). Partial so unlinked accounts (NULL/empty name) are exempt.';
