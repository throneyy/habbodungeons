-- Add fishing_xp and gardening_xp columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS fishing_xp INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS gardening_xp INTEGER DEFAULT 0;