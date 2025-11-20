-- Add featured dungeon tracking to dungeons table
ALTER TABLE public.dungeons 
ADD COLUMN is_featured boolean DEFAULT false,
ADD COLUMN times_played integer DEFAULT 0;

-- Update RLS policy to allow everyone to view featured dungeons
DROP POLICY IF EXISTS "Users can view dungeons they own or are in servers for" ON public.dungeons;

CREATE POLICY "Users can view featured or owned dungeons"
ON public.dungeons
FOR SELECT
USING (
  is_featured = true 
  OR auth.uid() = owner_user_id 
  OR EXISTS (
    SELECT 1
    FROM server_players sp
    JOIN servers s ON s.id = sp.server_id
    WHERE s.dungeon_id = dungeons.id 
    AND sp.user_id = auth.uid()
  )
);

-- Create index for faster featured dungeon queries
CREATE INDEX idx_dungeons_featured ON public.dungeons(is_featured, times_played DESC) WHERE is_featured = true;