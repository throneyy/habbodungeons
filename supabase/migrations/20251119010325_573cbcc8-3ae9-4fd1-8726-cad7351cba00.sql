-- First, clean up existing duplicate battles (keep the earliest one per server+dungeon)
WITH duplicates AS (
  SELECT id, 
         ROW_NUMBER() OVER (PARTITION BY server_id, dungeon_id ORDER BY created_at ASC) as rn
  FROM battle_states
  WHERE server_id IS NOT NULL
)
DELETE FROM battle_states
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Now add unique constraint to prevent future duplicate server battles
ALTER TABLE battle_states 
ADD CONSTRAINT unique_server_dungeon 
UNIQUE NULLS NOT DISTINCT (server_id, dungeon_id);