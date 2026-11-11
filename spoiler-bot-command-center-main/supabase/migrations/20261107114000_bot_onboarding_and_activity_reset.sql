ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS start_help_text text NOT NULL DEFAULT 'Para começar, escolha uma opção nos botões abaixo. Envie /planos para consultar as opções, /meusplanos para ver seus acessos e /comprovantes para consultar pagamentos.',
  ADD COLUMN IF NOT EXISTS offer_button_style text NOT NULL DEFAULT 'primary'
    CHECK (offer_button_style IN ('success', 'primary', 'danger')),
  ADD COLUMN IF NOT EXISTS featured_button_style text NOT NULL DEFAULT 'success'
    CHECK (featured_button_style IN ('success', 'primary', 'danger')),
  ADD COLUMN IF NOT EXISTS follow_up_1_button_style text NOT NULL DEFAULT 'primary'
    CHECK (follow_up_1_button_style IN ('success', 'primary', 'danger')),
  ADD COLUMN IF NOT EXISTS follow_up_2_button_style text NOT NULL DEFAULT 'primary'
    CHECK (follow_up_2_button_style IN ('success', 'primary', 'danger')),
  ADD COLUMN IF NOT EXISTS follow_up_3_button_style text NOT NULL DEFAULT 'primary'
    CHECK (follow_up_3_button_style IN ('success', 'primary', 'danger'));

CREATE TABLE IF NOT EXISTS public.admin_activity_clears (
  scope_key text PRIMARY KEY,
  bot_id uuid REFERENCES public.bots(id) ON DELETE CASCADE,
  cleared_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_activity_clears_scope_check CHECK (
    (scope_key = '*' AND bot_id IS NULL)
    OR (scope_key <> '*' AND bot_id IS NOT NULL AND scope_key = bot_id::text)
  )
);

ALTER TABLE public.admin_activity_clears ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.admin_activity_clears TO authenticated;
GRANT ALL ON public.admin_activity_clears TO service_role;

DROP POLICY IF EXISTS "owners read activity clear markers" ON public.admin_activity_clears;
CREATE POLICY "owners read activity clear markers" ON public.admin_activity_clears
  FOR SELECT TO authenticated
  USING (
    scope_key = '*'
    OR EXISTS (
      SELECT 1 FROM public.bots
      WHERE bots.id = admin_activity_clears.bot_id AND bots.owner_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.admin_clear_activity(
  _updated_by uuid,
  _bot_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_scope_key text;
  v_deleted bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _updated_by AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Acesso restrito ao painel administrativo.';
  END IF;

  IF _bot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.bots WHERE id = _bot_id
  ) THEN
    RAISE EXCEPTION 'Bot não encontrado.';
  END IF;

  IF _bot_id IS NULL THEN
    DELETE FROM public.bot_start_events WHERE true;
    v_scope_key := '*';
  ELSE
    DELETE FROM public.bot_start_events WHERE bot_id = _bot_id;
    v_scope_key := _bot_id::text;
  END IF;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  INSERT INTO public.admin_activity_clears (scope_key, bot_id, cleared_at)
  VALUES (v_scope_key, _bot_id, now())
  ON CONFLICT (scope_key) DO UPDATE
    SET bot_id = EXCLUDED.bot_id,
        cleared_at = EXCLUDED.cleared_at;

  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_clear_activity(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_clear_activity(uuid, uuid) TO service_role;
