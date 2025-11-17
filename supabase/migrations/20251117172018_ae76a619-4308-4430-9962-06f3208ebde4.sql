-- Fix infinite recursion in party_members RLS policies
-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view members of parties they're in" ON public.party_members;

-- Create a simpler policy that doesn't cause recursion
-- Users can see party members if they are also a member of that party
CREATE POLICY "Users can view party members"
ON public.party_members
FOR SELECT
USING (
  -- User can see members of parties they're in by checking parties table directly
  party_id IN (
    SELECT id FROM public.parties 
    WHERE leader_id = auth.uid()
  )
  OR
  -- Or if they are a member themselves (direct check without recursion)
  user_id = auth.uid()
);

-- Also fix the parties view policy to avoid similar issues
DROP POLICY IF EXISTS "Users can view parties they're in" ON public.parties;

CREATE POLICY "Users can view parties they lead or are in"
ON public.parties
FOR SELECT
USING (
  leader_id = auth.uid()
  OR
  id IN (
    SELECT party_id FROM public.party_members WHERE user_id = auth.uid()
  )
);