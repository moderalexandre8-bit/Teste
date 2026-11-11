ALTER TABLE public.owner_settings
  ADD COLUMN IF NOT EXISTS store_locale text NOT NULL DEFAULT 'pt-BR';

ALTER TABLE public.owner_settings
  DROP CONSTRAINT IF EXISTS owner_settings_store_locale_check;

ALTER TABLE public.owner_settings
  ADD CONSTRAINT owner_settings_store_locale_check
  CHECK (store_locale IN ('pt-BR', 'en'));