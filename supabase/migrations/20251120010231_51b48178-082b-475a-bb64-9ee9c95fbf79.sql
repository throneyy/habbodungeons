-- Add xp_gained column to daily_stats table
ALTER TABLE public.daily_stats
ADD COLUMN xp_gained integer NOT NULL DEFAULT 0;