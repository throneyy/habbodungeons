-- Clean up duplicate global servers, keeping only the oldest of each name
DELETE FROM public.server_players
WHERE server_id IN (
  SELECT s.id
  FROM public.servers s
  WHERE s.dungeon_id IS NULL
  AND s.id NOT IN (
    SELECT DISTINCT ON (server_name, difficulty) id
    FROM public.servers
    WHERE dungeon_id IS NULL
    ORDER BY server_name, difficulty, created_at ASC
  )
);

DELETE FROM public.servers
WHERE dungeon_id IS NULL
AND id NOT IN (
  SELECT DISTINCT ON (server_name, difficulty) id
  FROM public.servers
  WHERE dungeon_id IS NULL
  ORDER BY server_name, difficulty, created_at ASC
);

-- Add a unique constraint to prevent duplicate global server names
CREATE UNIQUE INDEX unique_global_server_name 
ON public.servers (server_name, difficulty) 
WHERE dungeon_id IS NULL AND is_active = true;