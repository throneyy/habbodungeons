-- Fix infinite recursion by using a security definer function
-- This function bypasses RLS to check party membership without recursion

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view party members" ON public.party_members;
DROP POLICY IF EXISTS "Users can view parties they lead or are in" ON public.parties;

-- Create a security definer function to check if user is party leader
CREATE OR REPLACE FUNCTION public.is_party_leader(_party_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parties
    WHERE id = _party_id AND leader_id = _user_id
  )
$$;

-- Create a security definer function to check if user is party member
CREATE OR REPLACE FUNCTION public.is_party_member(_party_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.party_members
    WHERE party_id = _party_id AND user_id = _user_id
  )
$$;

-- Recreate party_members policies using security definer functions
CREATE POLICY "Users can view party members"
ON public.party_members
FOR SELECT
USING (
  public.is_party_leader(party_id, auth.uid())
  OR
  user_id = auth.uid()
);

-- Recreate parties policies using security definer functions
CREATE POLICY "Users can view parties they lead or are in"
ON public.parties
FOR SELECT
USING (
  leader_id = auth.uid()
  OR
  public.is_party_member(id, auth.uid())
);