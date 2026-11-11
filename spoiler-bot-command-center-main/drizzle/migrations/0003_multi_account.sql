-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  username text CHECK (username IS NULL OR username ~ '^[a-z0-9_.]{3,24}$'),
  avatar_url text,
  bio text CHECK (bio IS NULL OR length(bio) <= 280),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_username_key ON public.profiles (username);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name',''), NULLIF(NEW.raw_user_meta_data->>'full_name',''), NULLIF(NEW.raw_user_meta_data->>'name',''), split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
INSERT INTO public.profiles (id, display_name)
SELECT id, split_part(email, '@', 1) FROM auth.users ON CONFLICT (id) DO NOTHING;

-- Per-account settings
CREATE TABLE public.owner_settings (
  owner_id uuid PRIMARY KEY DEFAULT auth.uid(),
  cashin_mode text NOT NULL DEFAULT 'auto',
  cashin_manual_gateway text,
  cashout_mode text NOT NULL DEFAULT 'auto',
  cashout_manual_gateway text,
  charge_expiration_minutes integer NOT NULL DEFAULT 30,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.owner_settings TO authenticated;
GRANT ALL ON public.owner_settings TO service_role;
ALTER TABLE public.owner_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.owner_settings FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Ownership columns
ALTER TABLE public.bots ADD COLUMN owner_id uuid;
ALTER TABLE public.gateways ADD COLUMN owner_id uuid;
ALTER TABLE public.plans ADD COLUMN owner_id uuid DEFAULT auth.uid();
ALTER TABLE public.spoilers ADD COLUMN owner_id uuid DEFAULT auth.uid();
ALTER TABLE public.transactions ADD COLUMN owner_id uuid;
CREATE INDEX bots_owner_idx ON public.bots (owner_id);
CREATE INDEX gateways_owner_idx ON public.gateways (owner_id);
CREATE INDEX plans_owner_idx ON public.plans (owner_id);
CREATE INDEX spoilers_owner_idx ON public.spoilers (owner_id);
CREATE INDEX transactions_owner_idx ON public.transactions (owner_id, created_at DESC);
CREATE INDEX withdrawals_requested_by_idx ON public.withdrawals (requested_by, created_at DESC);

-- The same Telegram user or group can talk to bots of different accounts
ALTER TABLE public.telegram_users DROP CONSTRAINT telegram_users_pkey;
ALTER TABLE public.telegram_users ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.telegram_users ADD PRIMARY KEY (id);
CREATE UNIQUE INDEX telegram_users_bot_user_key ON public.telegram_users (bot_id, tg_user_id);
ALTER TABLE public.telegram_chats DROP CONSTRAINT telegram_chats_pkey;
ALTER TABLE public.telegram_chats ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.telegram_chats ADD PRIMARY KEY (id);
CREATE UNIQUE INDEX telegram_chats_bot_chat_key ON public.telegram_chats (bot_id, chat_id);

-- Ownership helpers
CREATE OR REPLACE FUNCTION public.owns_bot(_bot_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.bots WHERE id = _bot_id AND owner_id = auth.uid())
$$;
CREATE OR REPLACE FUNCTION public.owns_gateway(_gateway_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.gateways WHERE id = _gateway_id AND owner_id = auth.uid())
$$;
GRANT EXECUTE ON FUNCTION public.owns_bot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_gateway(uuid) TO authenticated;

-- Max 3 bots per account
CREATE OR REPLACE FUNCTION public.enforce_bot_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bot-limit:' || NEW.owner_id::text));
  IF (SELECT count(*) FROM public.bots WHERE owner_id = NEW.owner_id AND id <> NEW.id) >= 3 THEN
    RAISE EXCEPTION 'Limite de 3 bots por conta atingido' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER bots_owner_limit BEFORE INSERT OR UPDATE OF owner_id ON public.bots FOR EACH ROW EXECUTE FUNCTION public.enforce_bot_limit();

-- Replace shared-admin access with per-account access
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bot_settings','chat_media','gateways','gateway_logs','plans','spoilers','telegram_chats','telegram_users','transactions','subscriptions','withdrawals','user_roles','bots'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "admins read" ON public.%I', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS "admins write" ON public.plans;
DROP POLICY IF EXISTS "admins write" ON public.spoilers;
DROP POLICY IF EXISTS "admins update" ON public.bots;
DROP POLICY IF EXISTS "admins update" ON public.bot_settings;
DROP POLICY IF EXISTS "admins manage bot media" ON storage.objects;

CREATE POLICY "signed in read" ON public.bot_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "own bots read" ON public.bots FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "own bots update" ON public.bots FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "own gateways read" ON public.gateways FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "own gateway logs read" ON public.gateway_logs FOR SELECT TO authenticated USING (public.owns_gateway(gateway_id));
CREATE POLICY "own plans" ON public.plans FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "own spoilers" ON public.spoilers FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid() AND (bot_id IS NULL OR public.owns_bot(bot_id)));
CREATE POLICY "own bot chats read" ON public.telegram_chats FOR SELECT TO authenticated USING (public.owns_bot(bot_id));
CREATE POLICY "own bot media read" ON public.chat_media FOR SELECT TO authenticated USING (public.owns_bot(bot_id));
CREATE POLICY "own bot leads read" ON public.telegram_users FOR SELECT TO authenticated USING (public.owns_bot(bot_id));
CREATE POLICY "own bot subscriptions read" ON public.subscriptions FOR SELECT TO authenticated USING (public.owns_bot(bot_id));
CREATE POLICY "own transactions read" ON public.transactions FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "own withdrawals read" ON public.withdrawals FOR SELECT TO authenticated USING (requested_by = auth.uid());

-- Spoiler files live under <account id>/...
CREATE POLICY "own bot media files read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bot-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own bot media files insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bot-media' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own bot media files delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'bot-media' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Profile photos live under avatars/<account id>/...
CREATE POLICY "avatars public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');
CREATE POLICY "own avatar insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own avatar update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own avatar delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);