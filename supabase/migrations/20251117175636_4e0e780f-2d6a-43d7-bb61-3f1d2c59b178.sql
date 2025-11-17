-- Add party_id to battle_states to support party battles
ALTER TABLE public.battle_states 
ADD COLUMN party_id uuid REFERENCES public.parties(id) ON DELETE CASCADE;

-- Update RLS policy to allow party members to view the battle
DROP POLICY IF EXISTS "Users can view own battles" ON public.battle_states;

CREATE POLICY "Users can view own or party battles"
ON public.battle_states
FOR SELECT
USING (
  auth.uid() = user_id 
  OR 
  (party_id IS NOT NULL AND public.can_view_party_members(party_id, auth.uid()))
);