-- Ensure battle_states captures complete row data for realtime updates
ALTER TABLE public.battle_states REPLICA IDENTITY FULL;