-- Update max players for servers to 6
ALTER TABLE public.servers 
ALTER COLUMN max_players SET DEFAULT 6;

-- Update max members for parties to 6
ALTER TABLE public.parties 
ALTER COLUMN max_members SET DEFAULT 6;