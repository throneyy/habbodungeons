-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view party members" ON public.party_members;

-- Create a security definer function to avoid recursion
CREATE OR REPLACE FUNCTION public.can_view_party_members(_party_id uuid, _user_id uuid)
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

-- Create new policy using the function
CREATE POLICY "Users can view party members"
ON public.party_members
FOR SELECT
USING (
  public.can_view_party_members(party_id, auth.uid())
);