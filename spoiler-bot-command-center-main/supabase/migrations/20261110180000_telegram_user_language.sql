ALTER TABLE public.telegram_users
  ADD COLUMN IF NOT EXISTS language_code text;