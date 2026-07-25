CREATE OR REPLACE FUNCTION public.sync_verified_habbo_admin_role(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_admin boolean;
BEGIN
  SELECT lower(habbo_username) = 'throney' AND habbo_verified_at IS NOT NULL
    INTO _is_admin
  FROM public.profiles
  WHERE id = _user_id;

  IF _is_admin IS TRUE THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    RETURN true;
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = _user_id
    AND role = 'admin'::public.app_role;
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_verified_habbo_admin_role(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_verified_habbo_admin_role(uuid) TO service_role;