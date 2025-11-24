-- Add fishing and gardening skill fields to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS fishing_level integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS gardening_level integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_habbo_skill_sync timestamptz,
ADD COLUMN IF NOT EXISTS unlocked_skills text[] DEFAULT '{}';

-- Create index for skill lookups
CREATE INDEX IF NOT EXISTS idx_profiles_skill_levels ON profiles(fishing_level, gardening_level);

-- Add comment explaining the fields
COMMENT ON COLUMN profiles.fishing_level IS 'Player fishing level from Habbo Fishing game';
COMMENT ON COLUMN profiles.gardening_level IS 'Player gardening level from Habbo Gardening game';
COMMENT ON COLUMN profiles.last_habbo_skill_sync IS 'Last time skills were synced from Habbo API';
COMMENT ON COLUMN profiles.unlocked_skills IS 'Array of unlocked skill IDs based on profession levels';