-- Fix handle_new_user to use username from auth metadata instead of email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Create profile using username from auth metadata (not email)
  INSERT INTO public.profiles (id, username)
  VALUES (
    new.id, 
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  
  -- Create default player stats
  INSERT INTO public.player_stats (user_id)
  VALUES (new.id);
  
  -- Add starter items to inventory
  INSERT INTO public.inventory (user_id, item_name, quantity, item_type)
  VALUES 
    (new.id, 'Potion', 5, 'consumable'),
    (new.id, 'Ether', 3, 'consumable'),
    (new.id, 'Rusty Sword', 1, 'weapon'),
    (new.id, 'Gold Coins', 100, 'currency'),
    (new.id, 'Runestones', 10, 'material'),
    (new.id, 'Crystal Shards', 5, 'material');
  
  RETURN new;
END;
$function$;

-- Fix existing l:l user's profile to have the correct username
UPDATE public.profiles 
SET username = 'l:l' 
WHERE username = 'l%3al@habbo-dungeons.local';