-- Make dungeon_id nullable for global servers
ALTER TABLE public.servers 
ALTER COLUMN dungeon_id DROP NOT NULL;