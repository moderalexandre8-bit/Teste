ALTER TABLE public.community_groups
  ADD COLUMN IF NOT EXISTS logo_url text;

ALTER TABLE public.community_groups
  DROP CONSTRAINT IF EXISTS community_groups_logo_url_https_check;

ALTER TABLE public.community_groups
  ADD CONSTRAINT community_groups_logo_url_https_check
  CHECK (logo_url IS NULL OR logo_url ~ '^https://');
