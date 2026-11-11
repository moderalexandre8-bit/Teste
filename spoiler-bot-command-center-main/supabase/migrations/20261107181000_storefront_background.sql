ALTER TABLE public.owner_settings
  ADD COLUMN IF NOT EXISTS store_background_image text;
