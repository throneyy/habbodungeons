-- Drop the old restrictive SELECT policy
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Create new public SELECT policy for profiles
-- Allow anyone (including anonymous users) to view profiles for search functionality
CREATE POLICY "Public can view profiles"
ON public.profiles
FOR SELECT
TO public
USING (true);