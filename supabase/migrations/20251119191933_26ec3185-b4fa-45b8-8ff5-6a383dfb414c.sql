-- Allow anyone to view player stats for public profiles
CREATE POLICY "Anyone can view player stats"
ON public.player_stats
FOR SELECT
USING (true);