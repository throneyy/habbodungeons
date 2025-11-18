-- Add cascade deletion for dungeons
-- When a dungeon is deleted, clean up all related data

-- First, drop existing foreign key constraints so we can recreate them with CASCADE
ALTER TABLE battle_states
DROP CONSTRAINT IF EXISTS battle_states_dungeon_id_fkey;

ALTER TABLE parties
DROP CONSTRAINT IF EXISTS parties_dungeon_id_fkey;

-- Recreate foreign key constraints with CASCADE DELETE
ALTER TABLE battle_states
ADD CONSTRAINT battle_states_dungeon_id_fkey
FOREIGN KEY (dungeon_id)
REFERENCES dungeons(id)
ON DELETE CASCADE;

ALTER TABLE parties
ADD CONSTRAINT parties_dungeon_id_fkey
FOREIGN KEY (dungeon_id)
REFERENCES dungeons(id)
ON DELETE CASCADE;

-- Add comment explaining the cascade behavior
COMMENT ON CONSTRAINT battle_states_dungeon_id_fkey ON battle_states IS 
'Cascade delete: when a dungeon is deleted, all associated battles are automatically deleted';

COMMENT ON CONSTRAINT parties_dungeon_id_fkey ON parties IS 
'Cascade delete: when a dungeon is deleted, all associated parties are automatically deleted';