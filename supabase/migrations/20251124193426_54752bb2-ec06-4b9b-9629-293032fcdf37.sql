-- Add ai_background_url column to dungeons table to store generated backgrounds
ALTER TABLE public.dungeons 
ADD COLUMN IF NOT EXISTS ai_background_url TEXT;

-- Add index for faster lookups when checking if background exists
CREATE INDEX IF NOT EXISTS idx_dungeons_ai_background_url ON public.dungeons(ai_background_url) WHERE ai_background_url IS NOT NULL;