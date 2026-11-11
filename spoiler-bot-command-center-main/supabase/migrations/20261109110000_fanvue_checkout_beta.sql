ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS fanvue_price_cents integer;

ALTER TABLE public.plans
  DROP CONSTRAINT IF EXISTS plans_fanvue_price_cents_check;

ALTER TABLE public.plans
  ADD CONSTRAINT plans_fanvue_price_cents_check
  CHECK (fanvue_price_cents IS NULL OR fanvue_price_cents BETWEEN 300 AND 1000000);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS checkout_url text,
  ADD COLUMN IF NOT EXISTS payment_currency text,
  ADD COLUMN IF NOT EXISTS provider_amount_minor bigint,
  ADD COLUMN IF NOT EXISTS fanvue_checkout_link_id text;

CREATE INDEX IF NOT EXISTS transactions_fanvue_provider_ref_idx
  ON public.transactions (provider_ref)
  WHERE provider_ref IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fanvue_access_allowlist (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fanvue_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_uuid uuid NOT NULL,
  creator_name text,
  access_token_ciphertext text NOT NULL,
  refresh_token_ciphertext text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  webhook_subscription_id text NOT NULL,
  webhook_secret_ciphertext text NOT NULL,
  sales_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fanvue_oauth_states (
  state_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_verifier text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fanvue_checkout_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  price_cents integer NOT NULL CHECK (price_cents BETWEEN 300 AND 1000000),
  product_uuid text,
  checkout_link_uuid text,
  checkout_url text,
  status text NOT NULL DEFAULT 'creating' CHECK (status IN ('creating', 'ready')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, plan_id, price_cents)
);

CREATE TABLE IF NOT EXISTS public.fanvue_webhook_events (
  event_id text PRIMARY KEY,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'failed')),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fanvue_access_allowlist',
    'fanvue_connections',
    'fanvue_oauth_states',
    'fanvue_checkout_links',
    'fanvue_webhook_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.admin_panel_stats()
RETURNS TABLE (
  user_count bigint,
  bot_count bigint,
  paid_sales_count bigint,
  paid_sales_amount_cents numeric,
  start_count bigint,
  active_nxgate_count bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    (SELECT count(*) FROM auth.users),
    (SELECT count(*) FROM public.bots),
    (SELECT count(*) FROM public.transactions WHERE kind = 'sale' AND status = 'paid'),
    (SELECT COALESCE(sum(amount_cents), 0) FROM public.transactions
      WHERE kind = 'sale' AND status = 'paid' AND COALESCE(payment_currency, 'BRL') = 'BRL'),
    (SELECT count(*) FROM public.bot_start_events),
    (SELECT count(*) FROM public.gateways WHERE provider = 'nxgate' AND status = 'active');
$$;

CREATE OR REPLACE FUNCTION public.admin_fanvue_sales_total()
RETURNS numeric
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(sum(provider_amount_minor), 0)
  FROM public.transactions
  WHERE kind = 'sale' AND status = 'paid' AND payment_currency = 'USD';
$$;

REVOKE ALL ON FUNCTION public.admin_fanvue_sales_total() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fanvue_sales_total() TO service_role;
