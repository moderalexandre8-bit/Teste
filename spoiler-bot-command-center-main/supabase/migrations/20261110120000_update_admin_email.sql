DO $$
DECLARE
  v_new_admin_id uuid;
BEGIN
  SELECT id INTO v_new_admin_id
  FROM auth.users
  WHERE lower(email) = 'tigerbot.info@gmail.com'
    AND email_confirmed_at IS NOT NULL;

  IF v_new_admin_id IS NULL THEN
    RAISE EXCEPTION 'Confirm the Auth account tigerbot.info@gmail.com before applying this migration.';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_new_admin_id, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  DELETE FROM public.user_roles AS roles
  USING auth.users AS users
  WHERE roles.user_id = users.id
    AND roles.role = 'admin'
    AND lower(users.email) = 'suporte.fluxobot@gmail.com';
END;
$$;
