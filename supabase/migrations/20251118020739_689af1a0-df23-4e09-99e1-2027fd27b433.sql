-- Add equipped weapon tracking to player_stats
ALTER TABLE public.player_stats
ADD COLUMN equipped_weapon_id UUID REFERENCES public.inventory(id) ON DELETE SET NULL;

-- Add equipped flag to inventory to track which weapon is equipped
ALTER TABLE public.inventory
ADD COLUMN is_equipped BOOLEAN DEFAULT FALSE;

-- Create index for faster equipped weapon lookups
CREATE INDEX idx_inventory_equipped ON public.inventory(user_id, is_equipped) WHERE is_equipped = TRUE;

-- Ensure only one weapon can be equipped at a time (constraint handled in app logic)