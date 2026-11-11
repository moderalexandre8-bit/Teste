ALTER TABLE public.owner_settings
  ADD COLUMN IF NOT EXISTS store_slug text,
  ADD COLUMN IF NOT EXISTS store_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS store_telegram_contact text,
  ADD COLUMN IF NOT EXISTS store_theme text NOT NULL DEFAULT 'tiger';

CREATE UNIQUE INDEX IF NOT EXISTS owner_settings_store_slug_key
  ON public.owner_settings (lower(store_slug))
  WHERE store_slug IS NOT NULL;

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS benefits text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS content_included text;

CREATE TABLE IF NOT EXISTS public.store_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, auth_user_id)
);
CREATE INDEX IF NOT EXISTS store_customers_auth_user_idx
  ON public.store_customers (auth_user_id, owner_id);
ALTER TABLE public.store_customers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_customers FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.store_customers TO service_role;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS store_customer_id uuid
    REFERENCES public.store_customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'telegram',
  ADD COLUMN IF NOT EXISTS store_plan_name text,
  ADD COLUMN IF NOT EXISTS store_plan_duration_days integer,
  ADD COLUMN IF NOT EXISTS store_plan_benefits text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS store_plan_content text;
DO $$ BEGIN
  ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_delivery_mode_check
    CHECK (delivery_mode IN ('telegram', 'store_token'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS transactions_store_customer_idx
  ON public.transactions (store_customer_id, created_at DESC)
  WHERE store_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.store_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.store_customers(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE,
  token_ciphertext text NOT NULL,
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'redeemed', 'revoked')),
  expires_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS store_access_tokens_owner_status_idx
  ON public.store_access_tokens (owner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS store_access_tokens_customer_idx
  ON public.store_access_tokens (customer_id, created_at DESC);
ALTER TABLE public.store_access_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_access_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.store_access_tokens TO service_role;
