-- Add XP system to player_stats
ALTER TABLE public.player_stats
ADD COLUMN IF NOT EXISTS current_xp integer NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS xp_to_next_level integer NOT NULL DEFAULT 100;

-- Update existing players to have initial XP values
UPDATE public.player_stats
SET current_xp = 0, xp_to_next_level = 100
WHERE current_xp IS NULL;