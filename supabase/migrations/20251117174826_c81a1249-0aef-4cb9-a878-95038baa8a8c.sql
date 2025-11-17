-- Fix party_members visibility so all members can see each other
DROP POLICY IF EXISTS "Users can view party members" ON public.party_members;

-- Allow viewing party members if you're in the same party
CREATE POLICY "Users can view party members"
ON public.party_members
FOR SELECT
USING (
  -- User is a member of this party (can see all members in their party)
  party_id IN (
    SELECT party_id FROM public.party_members 
    WHERE user_id = auth.uid()
  )
);