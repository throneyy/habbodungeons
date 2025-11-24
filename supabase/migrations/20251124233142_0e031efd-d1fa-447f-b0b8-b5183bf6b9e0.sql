-- Add used_skills tracking to battle_states
ALTER TABLE battle_states 
ADD COLUMN IF NOT EXISTS used_skills text[] DEFAULT '{}';

COMMENT ON COLUMN battle_states.used_skills IS 'Array of skill IDs used during this dungeon run (for once-per-dungeon skills)';