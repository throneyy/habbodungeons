alter table public.battle_states
  add column if not exists story_memory jsonb not null default '{}'::jsonb;