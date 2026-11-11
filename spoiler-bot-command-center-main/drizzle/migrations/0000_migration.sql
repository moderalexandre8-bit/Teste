CREATE TYPE public.app_role AS ENUM ('admin','user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE TABLE public.bot_settings (
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
INSERT INTO public.bot_settings (id) VALUES (1);

CREATE TABLE public.chat_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caption text, chat_id bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  file_id text NOT NULL, media_type text NOT NULL, message_id bigint NOT NULL
);

CREATE TABLE public.gateways (
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

CREATE TABLE public.gateway_secrets (
  gateway_id uuid PRIMARY KEY REFERENCES public.gateways(id) ON DELETE CASCADE,
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.gateway_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  data jsonb, gateway_id uuid,
  level text NOT NULL DEFAULT 'info',
  message text NOT NULL, operation text NOT NULL
);

CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  active boolean NOT NULL DEFAULT true, chat_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), description text, duration_days integer,
  name text NOT NULL, position integer NOT NULL DEFAULT 0, price_cents bigint NOT NULL
);

CREATE TABLE public.spoilers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  active boolean NOT NULL DEFAULT true, caption text, created_at timestamptz NOT NULL DEFAULT now(),
  file_id text, media_type text NOT NULL, media_url text, position integer NOT NULL DEFAULT 0
);

CREATE TABLE public.telegram_chats (
  chat_id bigint PRIMARY KEY, bot_status text, is_admin boolean NOT NULL DEFAULT false,
  title text, type text, updated_at timestamptz NOT NULL DEFAULT now(), username text
);

CREATE TABLE public.telegram_users (
  tg_user_id bigint PRIMARY KEY, chat_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), first_name text,
  last_seen_at timestamptz NOT NULL DEFAULT now(), username text
);

CREATE TABLE public.transactions (
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

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id bigint NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz,
  invite_link text, plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active', tg_user_id bigint NOT NULL,
  transaction_id uuid UNIQUE REFERENCES public.transactions(id) ON DELETE SET NULL
);

CREATE TABLE public.withdrawals (
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
      EXECUTE format('CREATE POLICY "admins read" ON public.%I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''admin''))', t);
    END IF;
  END LOOP;
END $$;
CREATE POLICY "own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;