-- Initial Supabase schema and supplied account seed data for the local app.
-- Safe to rerun after an interrupted execution; existing rows are preserved.
-- Source: drizzle/migrations/0000_migration.sql
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','user');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE TABLE IF NOT EXISTS public.bot_settings (
  id integer PRIMARY KEY DEFAULT 1,
  after_payment_text text NOT NULL DEFAULT 'Pagamento confirmado! Aqui está seu acesso:',
  bot_username text,
  cashin_manual_gateway text,
  cashin_mode text NOT NULL DEFAULT 'auto',
  cashout_manual_gateway text,
  cashout_mode text NOT NULL DEFAULT 'auto',
  charge_expiration_minutes integer NOT NULL DEFAULT 30,
  cta_text text NOT NULL DEFAULT 'Escolha seu plano',
  public_base_url text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  welcome_text text NOT NULL DEFAULT 'Bem-vindo!'
);
INSERT INTO public.bot_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.chat_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caption text, chat_id bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  file_id text NOT NULL, media_type text NOT NULL, message_id bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS public.gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cashin_enabled boolean NOT NULL DEFAULT true,
  cashout_enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  daily_limit_cents bigint,
  environment text NOT NULL DEFAULT 'production',
  fee_fixed_cents bigint NOT NULL DEFAULT 0,
  fee_percent numeric NOT NULL DEFAULT 0,
  last_balance_cents bigint, last_test_at timestamptz, last_test_message text, last_test_ok boolean,
  max_amount_cents bigint,
  min_amount_cents bigint NOT NULL DEFAULT 0,
  name text NOT NULL,
  priority integer NOT NULL DEFAULT 0,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'paused',
  webhook_token text NOT NULL DEFAULT encode(gen_random_bytes(24),'hex'),
  weight_cashin integer NOT NULL DEFAULT 1,
  weight_cashout integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS public.gateway_secrets (
  gateway_id uuid PRIMARY KEY REFERENCES public.gateways(id) ON DELETE CASCADE,
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gateway_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  data jsonb, gateway_id uuid,
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL, operation text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  active boolean NOT NULL DEFAULT true, chat_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), description text, duration_days integer,
  name text NOT NULL, position integer NOT NULL DEFAULT 0, price_cents bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS public.spoilers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  active boolean NOT NULL DEFAULT true, caption text, created_at timestamptz NOT NULL DEFAULT now(),
  file_id text, media_type text NOT NULL, media_url text, position integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.telegram_chats (
  chat_id bigint PRIMARY KEY, bot_status text, is_admin boolean NOT NULL DEFAULT false,
  title text, type text, updated_at timestamptz NOT NULL DEFAULT now(), username text
);

CREATE TABLE IF NOT EXISTS public.telegram_users (
  tg_user_id bigint PRIMARY KEY, chat_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), first_name text,
  last_seen_at timestamptz NOT NULL DEFAULT now(), username text,
  photo_data text
);

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_cents bigint NOT NULL, attempts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz, error text, expires_at timestamptz,
  fee_cents bigint NOT NULL DEFAULT 0,
  gateway_id uuid REFERENCES public.gateways(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL UNIQUE, kind text NOT NULL DEFAULT 'cashin',
  paid_at timestamptz, pix_code text,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  provider_ref text, qr_image text, status text NOT NULL DEFAULT 'pending', tg_user_id bigint
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz,
  invite_link text, plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active', tg_user_id bigint NOT NULL,
  transaction_id uuid UNIQUE REFERENCES public.transactions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount_cents bigint NOT NULL, attempts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), error text, fee_cents bigint NOT NULL DEFAULT 0,
  gateway_id uuid REFERENCES public.gateways(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL UNIQUE, pix_key text NOT NULL, pix_key_type text NOT NULL,
  provider_ref text, requested_by uuid, status text NOT NULL DEFAULT 'pending',
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['user_roles','bot_settings','chat_media','gateways','gateway_secrets','gateway_logs','plans','spoilers','telegram_chats','telegram_users','transactions','subscriptions','withdrawals'] LOOP
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF t <> 'gateway_secrets' THEN
      EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
      EXECUTE format('DROP POLICY IF EXISTS "admins read" ON public.%I', t);
      EXECUTE format('CREATE POLICY "admins read" ON public.%I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''admin''))', t);
    END IF;
  END LOOP;
END $$;
DROP POLICY IF EXISTS "own roles" ON public.user_roles;
CREATE POLICY "own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- Required private Supabase Storage buckets.
INSERT INTO storage.buckets (id, name, public) VALUES ('bot-media', 'bot-media', false), ('avatars', 'avatars', false) ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Source: drizzle/migrations/0001_multi_bots.sql
CREATE TABLE IF NOT EXISTS public.bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_bot_id bigint NOT NULL UNIQUE,
  username text NOT NULL,
  name text NOT NULL,
  photo_data text,
  active boolean NOT NULL DEFAULT true,
  welcome_text text NOT NULL DEFAULT 'Bem-vindo ao VIP!',
  cta_text text NOT NULL DEFAULT 'Escolha seu plano',
  after_payment_text text NOT NULL DEFAULT 'Pagamento confirmado! Aqui está seu acesso:',
  webhook_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.bot_secrets (
  bot_id uuid PRIMARY KEY REFERENCES public.bots(id) ON DELETE CASCADE,
  token text NOT NULL,
  webhook_secret text NOT NULL DEFAULT encode(gen_random_bytes(32),'hex')
);
GRANT SELECT, UPDATE ON public.bots TO authenticated;
GRANT ALL ON public.bots TO service_role;
GRANT ALL ON public.bot_secrets TO service_role;
ALTER TABLE public.bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_secrets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read" ON public.bots;
CREATE POLICY "admins read" ON public.bots FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "admins update" ON public.bots;
CREATE POLICY "admins update" ON public.bots FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

ALTER TABLE public.telegram_chats ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL;
ALTER TABLE public.chat_media ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL;
ALTER TABLE public.spoilers ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES public.bots(id) ON DELETE CASCADE;
ALTER TABLE public.telegram_users ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS chat_media_uniq ON public.chat_media (chat_id, message_id, file_id);

GRANT INSERT, UPDATE, DELETE ON public.plans, public.spoilers TO authenticated;
GRANT UPDATE ON public.bot_settings TO authenticated;
DROP POLICY IF EXISTS "admins write" ON public.plans;
CREATE POLICY "admins write" ON public.plans FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "admins write" ON public.spoilers;
CREATE POLICY "admins write" ON public.spoilers FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS "admins update" ON public.bot_settings;
CREATE POLICY "admins update" ON public.bot_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "admins manage bot media" ON storage.objects;
CREATE POLICY "admins manage bot media" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'bot-media' AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id = 'bot-media' AND public.has_role(auth.uid(),'admin'));

-- Source: drizzle/migrations/0002_bot_sale_notify.sql
ALTER TABLE public.bots ADD COLUMN IF NOT EXISTS notify_chat_id bigint;

-- Source: drizzle/migrations/0003_multi_account.sql
-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  username text CHECK (username IS NULL OR username ~ '^[a-z0-9_.]{3,24}$'),
  avatar_url text,
  bio text CHECK (bio IS NULL OR length(bio) <= 280),
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON public.profiles (username);
REVOKE INSERT, UPDATE ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT INSERT (id, display_name, username, avatar_url, bio) ON public.profiles TO authenticated;
GRANT UPDATE (display_name, username, avatar_url, bio, updated_at) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own profile read" ON public.profiles;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
DROP POLICY IF EXISTS "own profile insert" ON public.profiles;
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, is_verified)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'display_name',''), NULLIF(NEW.raw_user_meta_data->>'full_name',''), NULLIF(NEW.raw_user_meta_data->>'name',''), split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE(lower(NEW.email) IN ('alexandremoder0707@gmail.com', 'wirlencandido7@gmail.com'), false)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
INSERT INTO public.profiles (id, display_name)
SELECT id, split_part(email, '@', 1) FROM auth.users ON CONFLICT (id) DO NOTHING;
UPDATE public.profiles AS p
SET is_verified = COALESCE(lower(u.email) IN ('alexandremoder0707@gmail.com', 'wirlencandido7@gmail.com'), false)
FROM auth.users AS u
WHERE u.id = p.id
  AND p.is_verified IS DISTINCT FROM COALESCE(lower(u.email) IN ('alexandremoder0707@gmail.com', 'wirlencandido7@gmail.com'), false);

-- Per-account settings
CREATE TABLE IF NOT EXISTS public.owner_settings (
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
DROP POLICY IF EXISTS "own settings" ON public.owner_settings;
CREATE POLICY "own settings" ON public.owner_settings FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

-- Ownership columns
ALTER TABLE public.bots ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.gateways ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS owner_id uuid DEFAULT auth.uid();
ALTER TABLE public.spoilers ADD COLUMN IF NOT EXISTS owner_id uuid DEFAULT auth.uid();
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS owner_id uuid;
CREATE INDEX IF NOT EXISTS bots_owner_idx ON public.bots (owner_id);
CREATE INDEX IF NOT EXISTS gateways_owner_idx ON public.gateways (owner_id);
CREATE INDEX IF NOT EXISTS plans_owner_idx ON public.plans (owner_id);
CREATE INDEX IF NOT EXISTS spoilers_owner_idx ON public.spoilers (owner_id);
CREATE INDEX IF NOT EXISTS transactions_owner_idx ON public.transactions (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS withdrawals_requested_by_idx ON public.withdrawals (requested_by, created_at DESC);

-- The same Telegram user or group can talk to bots of different accounts
ALTER TABLE public.telegram_users DROP CONSTRAINT IF EXISTS telegram_users_pkey;
ALTER TABLE public.telegram_users ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.telegram_users ADD COLUMN IF NOT EXISTS photo_data text;
ALTER TABLE public.telegram_users ADD PRIMARY KEY (id);
CREATE UNIQUE INDEX IF NOT EXISTS telegram_users_bot_user_key ON public.telegram_users (bot_id, tg_user_id);
ALTER TABLE public.telegram_chats DROP CONSTRAINT IF EXISTS telegram_chats_pkey;
ALTER TABLE public.telegram_chats ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.telegram_chats ADD PRIMARY KEY (id);
CREATE UNIQUE INDEX IF NOT EXISTS telegram_chats_bot_chat_key ON public.telegram_chats (bot_id, chat_id);

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
DROP TRIGGER IF EXISTS bots_owner_limit ON public.bots;
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

DROP POLICY IF EXISTS "signed in read" ON public.bot_settings;
CREATE POLICY "signed in read" ON public.bot_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "own bots read" ON public.bots;
CREATE POLICY "own bots read" ON public.bots FOR SELECT TO authenticated USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "own bots update" ON public.bots;
CREATE POLICY "own bots update" ON public.bots FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "own gateways read" ON public.gateways;
CREATE POLICY "own gateways read" ON public.gateways FOR SELECT TO authenticated USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "own gateway logs read" ON public.gateway_logs;
CREATE POLICY "own gateway logs read" ON public.gateway_logs FOR SELECT TO authenticated USING (public.owns_gateway(gateway_id));
DROP POLICY IF EXISTS "own plans" ON public.plans;
CREATE POLICY "own plans" ON public.plans FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
DROP POLICY IF EXISTS "own spoilers" ON public.spoilers;
CREATE POLICY "own spoilers" ON public.spoilers FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid() AND (bot_id IS NULL OR public.owns_bot(bot_id)));
DROP POLICY IF EXISTS "own bot chats read" ON public.telegram_chats;
CREATE POLICY "own bot chats read" ON public.telegram_chats FOR SELECT TO authenticated USING (public.owns_bot(bot_id));
DROP POLICY IF EXISTS "own bot media read" ON public.chat_media;
CREATE POLICY "own bot media read" ON public.chat_media FOR SELECT TO authenticated USING (public.owns_bot(bot_id));
DROP POLICY IF EXISTS "own bot leads read" ON public.telegram_users;
CREATE POLICY "own bot leads read" ON public.telegram_users FOR SELECT TO authenticated USING (public.owns_bot(bot_id));
DROP POLICY IF EXISTS "own bot subscriptions read" ON public.subscriptions;
CREATE POLICY "own bot subscriptions read" ON public.subscriptions FOR SELECT TO authenticated USING (public.owns_bot(bot_id));
DROP POLICY IF EXISTS "own transactions read" ON public.transactions;
CREATE POLICY "own transactions read" ON public.transactions FOR SELECT TO authenticated USING (owner_id = auth.uid());
DROP POLICY IF EXISTS "own withdrawals read" ON public.withdrawals;
CREATE POLICY "own withdrawals read" ON public.withdrawals FOR SELECT TO authenticated USING (requested_by = auth.uid());

-- Spoiler files live under <account id>/...
DROP POLICY IF EXISTS "own bot media files read" ON storage.objects;
CREATE POLICY "own bot media files read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'bot-media' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "own bot media files insert" ON storage.objects;
CREATE POLICY "own bot media files insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'bot-media' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "own bot media files delete" ON storage.objects;
CREATE POLICY "own bot media files delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'bot-media' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Profile photos live under avatars/<account id>/...
DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
CREATE POLICY "avatars public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');
DROP POLICY IF EXISTS "own avatar insert" ON storage.objects;
CREATE POLICY "own avatar insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "own avatar update" ON storage.objects;
CREATE POLICY "own avatar update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "own avatar delete" ON storage.objects;
CREATE POLICY "own avatar delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Source: drizzle/migrations/0004_avatars_private_read.sql
DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
DROP POLICY IF EXISTS "own avatar read" ON storage.objects;
CREATE POLICY "own avatar read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Source: drizzle/migrations/0005_bot_media_channel.sql
ALTER TABLE public.bots ADD COLUMN IF NOT EXISTS media_chat_id bigint;
ALTER TABLE public.bots ADD COLUMN IF NOT EXISTS group_photos boolean NOT NULL DEFAULT true;
ALTER TABLE public.bots ADD COLUMN IF NOT EXISTS group_videos boolean NOT NULL DEFAULT true;
ALTER TABLE public.spoilers ADD COLUMN IF NOT EXISTS tg_file_ids jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.spoilers.tg_file_ids IS 'Telegram file_id per bot id (file ids are bot-specific); filled from the media channel or first send';
UPDATE public.spoilers SET tg_file_ids = jsonb_build_object(bot_id::text, file_id) WHERE file_id IS NOT NULL AND bot_id IS NOT NULL;

-- Keep the all-time approved-buyer leaderboard fast for each account.
CREATE INDEX IF NOT EXISTS transactions_buyer_ranking_idx
  ON public.transactions (owner_id, tg_user_id)
  INCLUDE (amount_cents, paid_at)
  WHERE kind = 'sale' AND status = 'paid' AND tg_user_id IS NOT NULL;

-- Returns only the authenticated account's top buyers and aggregate sales stats.
DROP FUNCTION IF EXISTS public.get_buyer_ranking(integer);
CREATE FUNCTION public.get_buyer_ranking(_limit integer DEFAULT 5)
RETURNS TABLE (
  ranking_position bigint,
  tg_user_id bigint,
  username text,
  first_name text,
  photo_data text,
  approved_purchases bigint,
  total_spent_cents bigint,
  total_buyers bigint,
  all_approved_purchases bigint,
  all_revenue_cents bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH buyer_sales AS (
    SELECT
      t.tg_user_id,
      count(*)::bigint AS approved_purchases,
      sum(t.amount_cents)::bigint AS total_spent_cents
    FROM public.transactions AS t
    WHERE t.owner_id = auth.uid()
      AND t.kind = 'sale'
      AND t.status = 'paid'
      AND t.tg_user_id IS NOT NULL
    GROUP BY t.tg_user_id
  ),
  buyer_labels AS (
    SELECT DISTINCT ON (tu.tg_user_id)
      tu.tg_user_id,
      tu.username,
      tu.first_name,
      tu.photo_data
    FROM public.telegram_users AS tu
    INNER JOIN public.bots AS b ON b.id = tu.bot_id
    WHERE b.owner_id = auth.uid()
    ORDER BY tu.tg_user_id, tu.last_seen_at DESC
  ),
  ranked_buyers AS (
    SELECT
      row_number() OVER (
        ORDER BY s.approved_purchases DESC, s.total_spent_cents DESC, s.tg_user_id
      ) AS ranking_position,
      s.tg_user_id,
      l.username,
      l.first_name,
      l.photo_data,
      s.approved_purchases,
      s.total_spent_cents
    FROM buyer_sales AS s
    LEFT JOIN buyer_labels AS l ON l.tg_user_id = s.tg_user_id
  ),
  totals AS (
    SELECT
      count(*)::bigint AS total_buyers,
      coalesce(sum(approved_purchases), 0)::bigint AS all_approved_purchases,
      coalesce(sum(total_spent_cents), 0)::bigint AS all_revenue_cents
    FROM buyer_sales
  )
  SELECT
    r.ranking_position,
    r.tg_user_id,
    r.username,
    r.first_name,
    r.photo_data,
    r.approved_purchases,
    r.total_spent_cents,
    totals.total_buyers,
    totals.all_approved_purchases,
    totals.all_revenue_cents
  FROM totals
  LEFT JOIN LATERAL (
    SELECT ranked_buyers.*
    FROM ranked_buyers
    ORDER BY ranked_buyers.ranking_position
    LIMIT greatest(1, least(coalesce(_limit, 5), 100))
  ) AS r ON true
  ORDER BY r.ranking_position NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.get_buyer_ranking(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_buyer_ranking(integer) TO authenticated;

-- Seed the supplied account data only when its matching Auth user already exists.
-- Passwords, Telegram bot tokens, gateway API keys, webhook secrets and invite links
-- must be configured separately; never store shared credentials in this SQL file.
DO $seed$
DECLARE
  account_id uuid;
  gateway_id constant uuid := 'f6cf9238-3e63-4ba9-967b-7307f05a2285';
  bot_id constant uuid := '9fdb82fd-662c-48de-baa8-82605ef3a05e';
BEGIN
  SELECT id INTO account_id
  FROM auth.users
  WHERE lower(email) = 'alexandremoder0707@gmail.com'
  LIMIT 1;

  IF account_id IS NULL THEN
    RAISE NOTICE 'Seed data skipped: create the Auth user alexandremoder0707@gmail.com, then rerun this SQL.';
    RETURN;
  END IF;

  INSERT INTO public.profiles (id, display_name, username, avatar_url, bio, is_verified)
  VALUES (
    account_id,
    'Alexandre candido',
    'alexandre.candido',
    account_id::text || '/avatar-1793848072128.webp',
    'CEO',
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    username = EXCLUDED.username,
    avatar_url = EXCLUDED.avatar_url,
    bio = EXCLUDED.bio,
    is_verified = true;

  INSERT INTO public.gateways (
    id, owner_id, name, provider, status, environment, priority,
    weight_cashin, weight_cashout, min_amount_cents, fee_percent, fee_fixed_cents,
    cashin_enabled, cashout_enabled, config
  ) VALUES (
    gateway_id, account_id, 'NXGate', 'nxgate', 'paused', 'production', 1,
    50, 50, 100, 0, 0, true, true, '{}'::jsonb
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.owner_settings (
    owner_id, cashin_mode, cashin_manual_gateway, cashout_mode,
    cashout_manual_gateway, charge_expiration_minutes
  ) VALUES (
    account_id, 'auto', NULL, 'priority', gateway_id::text, 30
  )
  ON CONFLICT (owner_id) DO NOTHING;

  INSERT INTO public.bots (
    id, owner_id, tg_bot_id, username, name, active,
    welcome_text, cta_text, after_payment_text, webhook_url,
    notify_chat_id, media_chat_id, group_photos, group_videos
  ) VALUES (
    bot_id, account_id, 9141736082, 'Alicialuches_bot', 'Alicia luches', false,
    'Bem-vindo ao VIP!',
    E'😈 E aí, vai ficar só na vontade?\n\nEscolha seu plano favorito e venha descobrir tudo o que preparei para você. ❤️‍🔥\n\nFotos, vídeos exclusivos, bônus especiais e experiências ainda mais próximas...\n\n🔥 Seu acesso começa agora. Qual vai ser sua escolha?',
    'Pagamento confirmado! Aqui está seu acesso:',
    NULL,
    8806094271, -1003800001792, true, true
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.plans (
    id, owner_id, name, price_cents, duration_days, description, chat_id, position, active
  ) VALUES
    ('ac2df514-56f2-4905-964f-493d53dee15c', account_id, '❤️ Acesso Exclusivo', 1499, 30, 'Fotos e vídeos exclusivos + novidades frequentes', -1004336517941, 0, true),
    ('70b91b26-8dc7-4429-9efd-7649b5c895de', account_id, '🔥 Experiência Especial', 1990, 30, 'Todo o conteúdo exclusivo + um brinde surpresa especial. 🎁', -1004336517941, 0, true),
    ('04fa2e6f-faba-48a4-bd7b-6daf522d244f', account_id, 'Vip+ Video Personalizado e whatzapp', 5990, 30, NULL, -1004336517941, 0, true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.spoilers (
    id, owner_id, bot_id, media_type, media_url, position, active, tg_file_ids
  ) VALUES
    (
      '352d373f-e7fc-4151-ab9f-e18cffb1cde2', account_id, bot_id, 'photo',
      account_id::text || '/spoilers/a14a7d3b-cf87-4bfe-91ad-5351a31b8069-Screenshot_20261104-205933_2.jpg',
      1, true, jsonb_build_object(bot_id::text, 'AgACAgEAAyEGAATif20ABAlq6_3ZpOYlfY0XKQzxxd6jVuXGmQACaw5rGzWyYEchYumzncAKvwEAAwIAA3cAAz0E')
    ),
    (
      '47538f37-50e2-4370-b5ad-edaaa082a9e8', account_id, bot_id, 'video',
      account_id::text || '/spoilers/ce5ae00c-8d8e-4895-bee0-44681c9a3200-VID_20261104_191208_750.mp4',
      2, true, jsonb_build_object(bot_id::text, 'BAACAgEAAyEGAATif20ABAtq7AIdEXmVOhb3c2BSaEXx7fBIuAACuwkAAjWyYEdg7w7Ad2oB0T0E')
    )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.telegram_chats (
    id, bot_id, chat_id, title, type, is_admin, bot_status
  ) VALUES
    ('fbf853d0-dace-4ec2-85df-1b0f33832122', bot_id, -1003800001792, 'V1', 'supergroup', true, 'administrator'),
    ('9d7cbac1-4340-4019-a792-bd3dd0dcbb8d', bot_id, -1004336517941, 'Pagamento-aprovado', 'channel', true, 'administrator')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.telegram_users (
    id, bot_id, tg_user_id, chat_id, first_name, username
  ) VALUES
    ('73b6a31f-be92-4a3d-a9f7-23361187d052', bot_id, 7034720199, 7034720199, 'Jose Muiniki', NULL),
    ('e746a4b0-0043-4e95-8505-5d260e390f38', bot_id, 6065339312, 6065339312, 'Lead', 'restrit7fe'),
    ('e651e98d-81a1-493c-9d9a-8f82b746e346', bot_id, 8219814637, 8219814637, 'Rodriguez7', NULL),
    ('1bdd4abd-bd13-4539-932d-4064cee08d16', bot_id, 5422914208, 5422914208, 'Dion', 'Dion010419'),
    ('8bcfeb51-811c-4541-80b8-e21203394a44', bot_id, 5389101237, 5389101237, 'RODAIR', NULL),
    ('93d045e1-2044-4fae-8100-cae3f916965d', bot_id, 1075783452, 1075783452, 'Kalle', 'Kalle_ozg'),
    ('e49b625d-ee29-4bdc-9d26-d5282998c87f', bot_id, 8229482782, 8229482782, 'Roberto', NULL),
    ('8df1015d-fe97-449e-8173-be69b78a4e54', bot_id, 8806094271, 8806094271, 'alejandro', NULL),
    ('bda20550-8fda-4c89-bb07-b61026913fd1', bot_id, 8826132280, 8826132280, 'Romário Alves', NULL)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.transactions (
    id, owner_id, bot_id, gateway_id, plan_id, tg_user_id,
    amount_cents, fee_cents, kind, status, provider_ref,
    idempotency_key, created_at, paid_at, delivered_at, expires_at
  ) VALUES (
    '2def0288-bb59-4de7-a9cb-a9433aced0a9',
    account_id, bot_id, gateway_id, '70b91b26-8dc7-4429-9efd-7649b5c895de', 7034720199,
    1990, 0, 'sale', 'paid', '26110504cc3c398c82b14296b1',
    '7afb92e7-2621-4f4d-860e-41d2512fe094',
    '2026-11-05 04:55:16.159953+00', '2026-11-05 04:56:21.088+00',
    '2026-11-05 04:56:23.772+00', '2026-11-05 05:25:17.322+00'
  )
  ON CONFLICT (id) DO UPDATE SET
    owner_id = EXCLUDED.owner_id,
    bot_id = EXCLUDED.bot_id,
    gateway_id = EXCLUDED.gateway_id,
    plan_id = EXCLUDED.plan_id,
    tg_user_id = EXCLUDED.tg_user_id,
    amount_cents = EXCLUDED.amount_cents,
    fee_cents = EXCLUDED.fee_cents,
    kind = EXCLUDED.kind,
    status = EXCLUDED.status,
    provider_ref = EXCLUDED.provider_ref,
    idempotency_key = EXCLUDED.idempotency_key,
    created_at = EXCLUDED.created_at,
    paid_at = EXCLUDED.paid_at,
    delivered_at = EXCLUDED.delivered_at,
    expires_at = EXCLUDED.expires_at;

  INSERT INTO public.subscriptions (
    id, bot_id, transaction_id, plan_id, tg_user_id, chat_id,
    status, created_at, expires_at
  ) VALUES (
    '612b28a2-cb6f-402a-888b-0647d158f9be', bot_id,
    '2def0288-bb59-4de7-a9cb-a9433aced0a9', '70b91b26-8dc7-4429-9efd-7649b5c895de',
    7034720199, -1004336517941, 'active',
    '2026-11-05 04:56:23.339412+00', '2026-12-05 04:56:22.593+00'
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Account seed data loaded. Configure rotated gateway and Telegram credentials separately before activating them.';
END
$seed$;
