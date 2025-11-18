-- Update the handle_new_user function to include new starter items
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Create profile
  INSERT INTO public.profiles (id, username)
  VALUES (new.id, new.email);
  
  -- Create default player stats
  INSERT INTO public.player_stats (user_id)
  VALUES (new.id);
  
  -- Add starter items to inventory with new items
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