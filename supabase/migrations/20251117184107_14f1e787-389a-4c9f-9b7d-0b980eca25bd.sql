-- Enable realtime for battle_states table so party members can sync
ALTER PUBLICATION supabase_realtime ADD TABLE public.battle_states;