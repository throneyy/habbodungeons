-- Add habbo_origins_id column to profiles table to store the unique player ID
ALTER TABLE public.profiles
ADD COLUMN habbo_origins_id TEXT;

-- Add index for faster lookups
CREATE INDEX idx_profiles_habbo_origins_id ON public.profiles(habbo_origins_id);

COMMENT ON COLUMN public.profiles.habbo_origins_id IS 'Unique player ID from Habbo Origins API used for skill lookups';