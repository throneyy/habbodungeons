-- Add dead_players tracking to battle_states
ALTER TABLE battle_states ADD COLUMN IF NOT EXISTS dead_players jsonb DEFAULT '[]'::jsonb;