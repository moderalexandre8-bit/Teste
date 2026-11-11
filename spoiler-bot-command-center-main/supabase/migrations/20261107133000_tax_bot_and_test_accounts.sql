CREATE TABLE IF NOT EXISTS public.owner_tax_bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  tg_bot_id bigint NOT NULL UNIQUE,
  username text NOT NULL,
  name text NOT NULL,
  photo_data text,
  welcome_text text NOT NULL DEFAULT 'Seu pagamento do plano foi confirmado. Pague a taxa fixa de infraestrutura e processamento para liberar o acesso.',
  image_url text,
  apply_to_all_bots boolean NOT NULL DEFAULT true,
  webhook_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tax_bot_secrets (
  bot_id uuid PRIMARY KEY REFERENCES public.owner_tax_bots(id) ON DELETE CASCADE,
  token text NOT NULL,
  webhook_secret text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex')
);

CREATE TABLE IF NOT EXISTS public.bot_test_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tg_user_id bigint NOT NULL CHECK (tg_user_id > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, tg_user_id)
);

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS original_transaction_id uuid
    REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tax_bot_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS tax_fee_applicable boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS transactions_original_transaction_idx
  ON public.transactions (original_transaction_id, status)
  WHERE original_transaction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_one_active_tax_per_sale_idx
  ON public.transactions (original_transaction_id)
  WHERE kind = 'tax' AND original_transaction_id IS NOT NULL
    AND status IN ('creating', 'pending', 'paid');

CREATE OR REPLACE FUNCTION public.claim_transaction_delivery(
  _transaction_id uuid,
  _stale_before timestamptz
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH claimed AS (
    UPDATE public.transactions
    SET delivery_claimed_at = now()
    WHERE id = _transaction_id
      AND delivered_at IS NULL
      AND (delivery_claimed_at IS NULL OR delivery_claimed_at < _stale_before)
    RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM claimed);
$$;
REVOKE ALL ON FUNCTION public.claim_transaction_delivery(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_transaction_delivery(uuid, timestamptz) TO service_role;

ALTER TABLE public.owner_tax_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_bot_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_test_accounts ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.owner_tax_bots, public.tax_bot_secrets, public.bot_test_accounts TO service_role;
GRANT SELECT ON public.owner_tax_bots, public.bot_test_accounts TO authenticated;
GRANT INSERT, DELETE ON public.bot_test_accounts TO authenticated;

DROP POLICY IF EXISTS "owner reads tax bot config" ON public.owner_tax_bots;
CREATE POLICY "owner reads tax bot config" ON public.owner_tax_bots
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "owner manages test accounts" ON public.bot_test_accounts;
CREATE POLICY "owner manages test accounts" ON public.bot_test_accounts
  FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
