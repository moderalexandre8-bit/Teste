ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS lustify_price_eur_cents integer;

ALTER TABLE public.plans
  DROP CONSTRAINT IF EXISTS plans_lustify_price_eur_cents_check;

ALTER TABLE public.plans
  ADD CONSTRAINT plans_lustify_price_eur_cents_check
  CHECK (lustify_price_eur_cents IS NULL OR lustify_price_eur_cents BETWEEN 100 AND 70000);
