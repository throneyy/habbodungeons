-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert roles"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create enemy_sprites table for sprite mappings
CREATE TABLE public.enemy_sprites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enemy_name TEXT NOT NULL UNIQUE,
    sprite_filename TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on enemy_sprites
ALTER TABLE public.enemy_sprites ENABLE ROW LEVEL SECURITY;

-- RLS policies for enemy_sprites (everyone can read, only admins can modify)
CREATE POLICY "Anyone can view enemy sprites"
ON public.enemy_sprites
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can insert enemy sprites"
ON public.enemy_sprites
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update enemy sprites"
ON public.enemy_sprites
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete enemy sprites"
ON public.enemy_sprites
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_enemy_sprites_updated_at
BEFORE UPDATE ON public.enemy_sprites
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default enemy sprite mappings
INSERT INTO public.enemy_sprites (enemy_name, sprite_filename) VALUES
('Frozen Goblin', 'frozen-goblin.png'),
('Giant Rat', 'giant-rat.png'),
('Frost Wolf', 'frost-wolf.png'),
('Goblin Trio', 'goblin-trio.png'),
('Ice Shade', 'ice-shade.png'),
('Skeleton', 'skeleton.png'),
('Frostbite Spider', 'frostbite-spider.webp'),
('Frost Wraith', 'frost-wraith.png'),
('Glacial Imp', 'glacial-imp.png'),
('Ice Elemental', 'ice-elemental.png'),
('Frost Mutant', 'frost-mutant.png'),
('Ice Guardian', 'ice-guardian.png'),
('Flaming Phantom', 'flaming-phantom.png'),
('Fire Drake', 'fire-drake.png'),
('Werewolf', 'werewolf.png'),
('Undead Habbo', 'undead-habbo.png'),
('Ice Knight Commander', 'ice-knight-boss.png'),
('Blood Dragon', 'blood-dragon-boss.gif'),
('Frost Undead', 'frost-undead.gif'),
('Ice Tiger', 'ice-tiger.gif');