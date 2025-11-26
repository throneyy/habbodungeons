-- Create table for storing grid configurations per dungeon background
CREATE TABLE IF NOT EXISTS public.grid_configurations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dungeon_id UUID REFERENCES public.dungeons(id) ON DELETE CASCADE,
  background_url TEXT NOT NULL,
  grid_cols INTEGER NOT NULL DEFAULT 8,
  grid_rows INTEGER NOT NULL DEFAULT 6,
  enabled_cells JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(background_url)
);

-- Enable RLS
ALTER TABLE public.grid_configurations ENABLE ROW LEVEL SECURITY;

-- Anyone can view grid configurations
CREATE POLICY "Anyone can view grid configurations"
  ON public.grid_configurations
  FOR SELECT
  USING (true);

-- Authenticated users can create grid configurations
CREATE POLICY "Authenticated users can create grid configurations"
  ON public.grid_configurations
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Authenticated users can update grid configurations
CREATE POLICY "Authenticated users can update grid configurations"
  ON public.grid_configurations
  FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Add trigger for updated_at
CREATE TRIGGER update_grid_configurations_updated_at
  BEFORE UPDATE ON public.grid_configurations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups by background_url
CREATE INDEX idx_grid_configurations_background_url ON public.grid_configurations(background_url);