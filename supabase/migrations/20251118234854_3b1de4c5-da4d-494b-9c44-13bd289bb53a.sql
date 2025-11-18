-- Add turn-based combat fields to battle_states table
ALTER TABLE public.battle_states
ADD COLUMN IF NOT EXISTS current_turn_user_id UUID,
ADD COLUMN IF NOT EXISTS turn_order JSON DEFAULT '[]'::json;

-- Add index for faster turn lookups
CREATE INDEX IF NOT EXISTS idx_battle_states_current_turn 
ON public.battle_states(current_turn_user_id) 
WHERE is_active = true;