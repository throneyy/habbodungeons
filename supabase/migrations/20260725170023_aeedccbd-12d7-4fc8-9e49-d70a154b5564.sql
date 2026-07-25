GRANT SELECT ON public.room_layouts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.room_layouts TO authenticated;
GRANT ALL ON public.room_layouts TO service_role;