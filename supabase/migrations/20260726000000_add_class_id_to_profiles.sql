-- Restore profiles.class_id: it existed on the V1 schema (added by
-- 20251125050837_ace2e99a-5462-431e-98de-3c68f2500e98.sql) but was dropped
-- when the V2 REPLACEMENT migration (20260725153009) ran
-- `drop table if exists public.profiles cascade` and recreated the table
-- from scratch without it.
--
-- This is the calling ("class") a player locks in at hero creation
-- (js/identity.js Identity.setClass()) -- account-level state that should
-- survive a cleared localStorage / a new device for a signed-in player, the
-- same way habbo_figure/fishing_level/unlocked_skills already do.
--
-- No RLS policy or grant changes needed: the existing "profiles readable by
-- authed" / "profiles self upsert" / "profiles self update" policies and the
-- existing `grant select, insert, update on public.profiles to authenticated`
-- already cover the whole row, this column included.
alter table public.profiles
  add column if not exists class_id text;
