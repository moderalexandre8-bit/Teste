CREATE TABLE IF NOT EXISTS public.site_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  maintenance_enabled boolean NOT NULL DEFAULT false,
  maintenance_message text NOT NULL DEFAULT 'Estamos realizando uma manutenção para melhorar o TigerBot. Voltaremos em breve.',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.site_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.site_settings TO service_role;

CREATE OR REPLACE FUNCTION public.site_maintenance_status()
RETURNS TABLE (
  maintenance_enabled boolean,
  maintenance_message text,
  is_admin boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    settings.maintenance_enabled,
    settings.maintenance_message,
    COALESCE(public.has_role(auth.uid(), 'admin'::public.app_role), false)
  FROM public.site_settings AS settings
  WHERE settings.id = 1;
$$;

REVOKE ALL ON FUNCTION public.site_maintenance_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.site_maintenance_status() TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.device_push_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS device_push_tokens_user_idx
  ON public.device_push_tokens (user_id);

ALTER TABLE public.device_push_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.device_push_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.device_push_tokens TO service_role;

ALTER TABLE public.transactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'transactions'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'bot_start_events'
    ) THEN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_start_events';
    END IF;
  END IF;
END
$$;
