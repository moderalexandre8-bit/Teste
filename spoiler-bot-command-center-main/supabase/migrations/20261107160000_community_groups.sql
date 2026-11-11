CREATE TABLE IF NOT EXISTS public.community_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL CHECK (platform IN ('whatsapp', 'telegram')),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  description text CHECK (description IS NULL OR length(description) <= 500),
  url text NOT NULL CHECK (url ~ '^https://'),
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_groups_active_position_idx
  ON public.community_groups (position, created_at)
  WHERE active = true;

ALTER TABLE public.community_groups ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.community_groups TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.community_groups TO authenticated;

DROP POLICY IF EXISTS "authenticated read active community groups" ON public.community_groups;
CREATE POLICY "authenticated read active community groups" ON public.community_groups
  FOR SELECT TO authenticated
  USING (active OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admins manage community groups" ON public.community_groups;
CREATE POLICY "admins manage community groups" ON public.community_groups
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
