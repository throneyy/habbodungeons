-- Create storage bucket for generated item icons
INSERT INTO storage.buckets (id, name, public)
VALUES ('item-icons', 'item-icons', true);

-- Create RLS policies for item-icons bucket
CREATE POLICY "Anyone can view item icons"
ON storage.objects FOR SELECT
USING (bucket_id = 'item-icons');

CREATE POLICY "Authenticated users can upload item icons"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'item-icons' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can update item icons"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'item-icons' 
  AND auth.role() = 'authenticated'
);

-- Create table to track generated icons
CREATE TABLE public.generated_icons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT NOT NULL UNIQUE,
  item_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  prompt_used TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  regenerate_requested BOOLEAN DEFAULT false
);

-- Enable RLS on generated_icons
ALTER TABLE public.generated_icons ENABLE ROW LEVEL SECURITY;

-- RLS policies for generated_icons
CREATE POLICY "Anyone can view generated icons"
ON public.generated_icons FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can insert generated icons"
ON public.generated_icons FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update generated icons"
ON public.generated_icons FOR UPDATE
USING (auth.role() = 'authenticated');