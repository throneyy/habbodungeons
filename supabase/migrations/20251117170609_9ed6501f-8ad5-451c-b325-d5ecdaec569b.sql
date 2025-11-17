-- Create parties table
CREATE TABLE public.parties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invite_code TEXT NOT NULL UNIQUE,
  leader_id UUID NOT NULL,
  dungeon_id UUID REFERENCES public.dungeons(id) ON DELETE SET NULL,
  max_members INTEGER NOT NULL DEFAULT 4,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create party_members table
CREATE TABLE public.party_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  party_id UUID NOT NULL REFERENCES public.parties(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(party_id, user_id)
);

-- Enable RLS
ALTER TABLE public.parties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_members ENABLE ROW LEVEL SECURITY;

-- Policies for parties table
CREATE POLICY "Users can view parties they're in"
ON public.parties FOR SELECT
USING (
  id IN (
    SELECT party_id FROM public.party_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Party leaders can update their parties"
ON public.parties FOR UPDATE
USING (auth.uid() = leader_id);

CREATE POLICY "Users can create parties"
ON public.parties FOR INSERT
WITH CHECK (auth.uid() = leader_id);

CREATE POLICY "Party leaders can delete their parties"
ON public.parties FOR DELETE
USING (auth.uid() = leader_id);

-- Policies for party_members table
CREATE POLICY "Users can view members of parties they're in"
ON public.party_members FOR SELECT
USING (
  party_id IN (
    SELECT party_id FROM public.party_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can join parties"
ON public.party_members FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave parties"
ON public.party_members FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Party leaders can remove members"
ON public.party_members FOR DELETE
USING (
  party_id IN (
    SELECT id FROM public.parties WHERE leader_id = auth.uid()
  )
);

-- Create trigger for updating updated_at
CREATE TRIGGER update_parties_updated_at
BEFORE UPDATE ON public.parties
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to generate unique invite codes
CREATE OR REPLACE FUNCTION public.generate_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  code TEXT;
  exists BOOLEAN;
BEGIN
  LOOP
    -- Generate 6 character code with uppercase letters and numbers
    code := upper(substring(md5(random()::text) from 1 for 6));
    
    -- Check if code exists
    SELECT EXISTS(SELECT 1 FROM public.parties WHERE invite_code = code) INTO exists;
    
    EXIT WHEN NOT exists;
  END LOOP;
  
  RETURN code;
END;
$$;