-- Drop the old policy that only allows owners to view
DROP POLICY IF EXISTS "Users can view own dungeons" ON public.dungeons;

-- Create new policy that allows viewing if:
-- 1. User owns the dungeon, OR
-- 2. User is in a server that's linked to this dungeon
CREATE POLICY "Users can view dungeons they own or are in servers for"
ON public.dungeons
FOR SELECT
USING (
  auth.uid() = owner_user_id
  OR
  EXISTS (
    SELECT 1 FROM public.server_players sp
    INNER JOIN public.servers s ON s.id = sp.server_id
    WHERE s.dungeon_id = dungeons.id
    AND sp.user_id = auth.uid()
  )
);