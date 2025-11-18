-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own or party battles" ON public.battle_states;
DROP POLICY IF EXISTS "Users can manage own battles" ON public.battle_states;

-- Create new policy allowing users to view battles they own, are in the party for, OR are in the server for
CREATE POLICY "Users can view own, party, or server battles"
ON public.battle_states
FOR SELECT
USING (
  auth.uid() = user_id 
  OR (party_id IS NOT NULL AND can_view_party_members(party_id, auth.uid()))
  OR (server_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.server_players 
    WHERE server_id = battle_states.server_id 
    AND user_id = auth.uid()
  ))
);

-- Create new policy allowing users to manage battles they own OR are in the server for
CREATE POLICY "Users can manage own or server battles"
ON public.battle_states
FOR ALL
USING (
  auth.uid() = user_id
  OR (server_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.server_players 
    WHERE server_id = battle_states.server_id 
    AND user_id = auth.uid()
  ))
)
WITH CHECK (
  auth.uid() = user_id
  OR (server_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.server_players 
    WHERE server_id = battle_states.server_id 
    AND user_id = auth.uid()
  ))
);