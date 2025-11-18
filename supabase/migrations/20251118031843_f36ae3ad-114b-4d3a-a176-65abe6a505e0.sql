-- Create servers table (replacing the complex party system)
CREATE TABLE IF NOT EXISTS public.servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dungeon_id UUID NOT NULL REFERENCES dungeons(id) ON DELETE CASCADE,
  host_user_id UUID NOT NULL,
  server_name TEXT NOT NULL,
  max_players INTEGER NOT NULL DEFAULT 4,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create server_players table (replacing party_members)
CREATE TABLE IF NOT EXISTS public.server_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(server_id, user_id)
);

-- Add RLS policies for servers
ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active servers"
  ON public.servers FOR SELECT
  USING (is_active = true);

CREATE POLICY "Users can create their own servers"
  ON public.servers FOR INSERT
  WITH CHECK (auth.uid() = host_user_id);

CREATE POLICY "Host can update their server"
  ON public.servers FOR UPDATE
  USING (auth.uid() = host_user_id);

CREATE POLICY "Host can delete their server"
  ON public.servers FOR DELETE
  USING (auth.uid() = host_user_id);

-- Add RLS policies for server_players
ALTER TABLE public.server_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view server players"
  ON public.server_players FOR SELECT
  USING (true);

CREATE POLICY "Users can join servers"
  ON public.server_players FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave servers"
  ON public.server_players FOR DELETE
  USING (auth.uid() = user_id);

-- Update battle_states to reference servers instead of parties
ALTER TABLE public.battle_states 
  ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES servers(id) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX idx_servers_dungeon_active ON public.servers(dungeon_id, is_active);
CREATE INDEX idx_server_players_server ON public.server_players(server_id);

-- Add trigger for updated_at
CREATE TRIGGER update_servers_updated_at
  BEFORE UPDATE ON public.servers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();