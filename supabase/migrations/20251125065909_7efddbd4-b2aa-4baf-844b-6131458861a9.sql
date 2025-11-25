-- Add Gnoll enemy sprite to the game
INSERT INTO public.enemy_sprites (enemy_name, sprite_filename)
VALUES ('Gnoll', 'gnoll.png')
ON CONFLICT DO NOTHING;