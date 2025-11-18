-- Add current_story_node to battle_states to synchronize story across all players
ALTER TABLE public.battle_states
ADD COLUMN IF NOT EXISTS current_story_node jsonb DEFAULT NULL;