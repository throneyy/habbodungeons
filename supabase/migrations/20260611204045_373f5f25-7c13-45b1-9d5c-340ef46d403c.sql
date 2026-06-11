
-- =========================================================
-- PROFILES: restrict SELECT to authenticated users
-- =========================================================
DROP POLICY IF EXISTS "Public can view profiles" ON public.profiles;

CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- =========================================================
-- PARTIES: only leader or members may view (no public invite-code enumeration)
-- =========================================================
DROP POLICY IF EXISTS "Users can view parties" ON public.parties;

CREATE POLICY "Leaders and members can view parties"
  ON public.parties
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = leader_id
    OR public.is_party_member(id, auth.uid())
  );

-- =========================================================
-- REALTIME: require authentication to subscribe to any channel
-- (further per-topic restrictions can be added later as needed)
-- =========================================================
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can use realtime" ON realtime.messages;

CREATE POLICY "Authenticated users can use realtime"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (true);

-- =========================================================
-- GENERATED_ICONS: restrict writes to admins only
-- =========================================================
DROP POLICY IF EXISTS "Authenticated users can insert generated icons" ON public.generated_icons;
DROP POLICY IF EXISTS "Authenticated users can update generated icons" ON public.generated_icons;

CREATE POLICY "Admins can insert generated icons"
  ON public.generated_icons
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update generated icons"
  ON public.generated_icons
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- GRID_CONFIGURATIONS: only dungeon owners (or admins) may write
-- =========================================================
DROP POLICY IF EXISTS "Authenticated users can create grid configurations" ON public.grid_configurations;
DROP POLICY IF EXISTS "Authenticated users can update grid configurations" ON public.grid_configurations;

CREATE POLICY "Dungeon owners can create grid configurations"
  ON public.grid_configurations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (
      dungeon_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.dungeons d
        WHERE d.id = grid_configurations.dungeon_id
          AND d.owner_user_id = auth.uid()
      )
    )
  );

CREATE POLICY "Dungeon owners can update grid configurations"
  ON public.grid_configurations
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR (
      dungeon_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.dungeons d
        WHERE d.id = grid_configurations.dungeon_id
          AND d.owner_user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR (
      dungeon_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.dungeons d
        WHERE d.id = grid_configurations.dungeon_id
          AND d.owner_user_id = auth.uid()
      )
    )
  );

-- =========================================================
-- STORAGE item-icons bucket: drop broad public-list policy,
-- restrict uploads/updates to admins. The bucket stays public,
-- so existing public URLs continue to serve images.
-- =========================================================
DROP POLICY IF EXISTS "Anyone can view item icons" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload item icons" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update item icons" ON storage.objects;

CREATE POLICY "Admins can upload item icons"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'item-icons'
    AND public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Admins can update item icons"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'item-icons'
    AND public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    bucket_id = 'item-icons'
    AND public.has_role(auth.uid(), 'admin')
  );
