-- Add player class fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS class_id text,
ADD COLUMN IF NOT EXISTS custom_class_name text,
ADD COLUMN IF NOT EXISTS custom_class_description text,
ADD COLUMN IF NOT EXISTS custom_class_archetype text,
ADD COLUMN IF NOT EXISTS custom_class_icon text;