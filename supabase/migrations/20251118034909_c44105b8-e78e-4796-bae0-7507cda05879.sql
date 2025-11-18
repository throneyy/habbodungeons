-- Add difficulty column to servers table
ALTER TABLE public.servers 
ADD COLUMN IF NOT EXISTS difficulty TEXT NOT NULL DEFAULT 'Normal';

-- Add check constraint to ensure only valid difficulties
ALTER TABLE public.servers
ADD CONSTRAINT servers_difficulty_check 
CHECK (difficulty IN ('Normal', 'Hardcore'));