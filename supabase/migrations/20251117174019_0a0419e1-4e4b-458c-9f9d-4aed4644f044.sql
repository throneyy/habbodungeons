-- Fix party visibility for joining via invite code
-- Users need to be able to see a party to join it, even if they're not a member yet

DROP POLICY IF EXISTS "Users can view parties they lead or are in" ON public.parties;

-- Allow viewing parties if:
-- 1. You're the leader
-- 2. You're a member
-- 3. You're viewing a party (for joining purposes - anyone can see parties to potentially join)
CREATE POLICY "Users can view parties"
ON public.parties
FOR SELECT
USING (true);  -- Allow all authenticated users to view parties (needed for join-party function)