ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS name_en text,
  ADD COLUMN IF NOT EXISTS name_es text,
  ADD COLUMN IF NOT EXISTS description_en text,
  ADD COLUMN IF NOT EXISTS description_es text,
  ADD COLUMN IF NOT EXISTS benefits_en text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS benefits_es text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS content_included_en text,
  ADD COLUMN IF NOT EXISTS content_included_es text;