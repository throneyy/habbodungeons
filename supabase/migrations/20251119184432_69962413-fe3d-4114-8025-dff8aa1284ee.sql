-- Clean up all existing global servers to allow fresh creation with consistent naming
DELETE FROM server_players 
WHERE server_id IN (
  SELECT id FROM servers WHERE dungeon_id IS NULL
);

DELETE FROM servers 
WHERE dungeon_id IS NULL;