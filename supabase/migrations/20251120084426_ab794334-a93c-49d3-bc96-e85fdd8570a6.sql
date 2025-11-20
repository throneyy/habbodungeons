-- Allow public read access to enemy_sprites table so Monster Manual is viewable without login
CREATE POLICY "Allow public read access to enemy sprites"
ON public.enemy_sprites
FOR SELECT
USING (true);