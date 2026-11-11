ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS featured_plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS featured_button_text text NOT NULL DEFAULT 'Comprar em destaque',
  ADD COLUMN IF NOT EXISTS follow_up_1_button_text text NOT NULL DEFAULT 'Ver planos',
  ADD COLUMN IF NOT EXISTS follow_up_2_button_text text NOT NULL DEFAULT 'Ver planos',
  ADD COLUMN IF NOT EXISTS follow_up_3_button_text text NOT NULL DEFAULT 'Ver planos';

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS button_style text NOT NULL DEFAULT 'primary'
    CHECK (button_style IN ('success', 'primary', 'danger'));

CREATE TABLE IF NOT EXISTS public.bot_message_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stage text NOT NULL CHECK (stage IN ('start', 'follow_up_1', 'follow_up_2', 'follow_up_3')),
  media_type text NOT NULL CHECK (media_type IN ('photo', 'video', 'audio')),
  media_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bot_id, stage)
);

ALTER TABLE public.bot_message_media ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_message_media TO authenticated;
GRANT ALL ON public.bot_message_media TO service_role;

DROP POLICY IF EXISTS "bot owners manage message media" ON public.bot_message_media;
CREATE POLICY "bot owners manage message media" ON public.bot_message_media
  FOR ALL TO authenticated
  USING (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bots
      WHERE bots.id = bot_message_media.bot_id AND bots.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bots
      WHERE bots.id = bot_message_media.bot_id AND bots.owner_id = auth.uid()
    )
  );
