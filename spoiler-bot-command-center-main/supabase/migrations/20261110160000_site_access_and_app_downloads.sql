ALTER TABLE public.site_settings
  ADD COLUMN IF NOT EXISTS registration_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS registration_message text NOT NULL DEFAULT 'Novos cadastros estão temporariamente pausados. Tente novamente em breve.',
  ADD COLUMN IF NOT EXISTS max_users integer NOT NULL DEFAULT 1000000,
  ADD COLUMN IF NOT EXISTS download_android_url text,
  ADD COLUMN IF NOT EXISTS download_ios_url text,
  ADD COLUMN IF NOT EXISTS download_image_url text;

ALTER TABLE public.site_settings
  DROP CONSTRAINT IF EXISTS site_settings_max_users_check;
ALTER TABLE public.site_settings
  ADD CONSTRAINT site_settings_max_users_check CHECK (max_users BETWEEN 1 AND 1000000);

CREATE OR REPLACE FUNCTION public.enforce_site_signup_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  settings public.site_settings%ROWTYPE;
  current_users bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('site-global-user-limit'));

  SELECT * INTO settings
  FROM public.site_settings
  WHERE id = 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não foi possível verificar as configurações de cadastro.';
  END IF;

  IF NOT settings.registration_enabled THEN
    RAISE EXCEPTION '%', settings.registration_message USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO current_users FROM auth.users;
  IF current_users >= settings.max_users THEN
    RAISE EXCEPTION 'O limite global de % contas foi atingido.', settings.max_users
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_site_signup_limits() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_site_signup_limits ON auth.users;
CREATE TRIGGER enforce_site_signup_limits
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_site_signup_limits();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'site-assets',
  'site-assets',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "public site assets read" ON storage.objects;
CREATE POLICY "public site assets read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'site-assets');

DROP POLICY IF EXISTS "admins upload site assets" ON storage.objects;
CREATE POLICY "admins upload site assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'site-assets'
    AND name = 'app-download-banner'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "admins update site assets" ON storage.objects;
CREATE POLICY "admins update site assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'site-assets'
    AND name = 'app-download-banner'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    bucket_id = 'site-assets'
    AND name = 'app-download-banner'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );
