ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS access_button_text text NOT NULL DEFAULT '🔓 Liberar acesso';

ALTER TABLE public.bot_message_media
  ADD COLUMN IF NOT EXISTS telegram_file_id text;

CREATE TABLE IF NOT EXISTS public.recovery_funnels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recovery_funnel_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.recovery_funnels(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  delay_minutes integer NOT NULL CHECK (delay_minutes BETWEEN 1 AND 525600),
  message_text text NOT NULL CHECK (length(trim(message_text)) BETWEEN 1 AND 4000),
  media_type text CHECK (media_type IN ('photo', 'video')),
  media_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (funnel_id, position),
  CHECK ((media_type IS NULL) = (media_url IS NULL))
);

CREATE TABLE IF NOT EXISTS public.recovery_funnel_bots (
  funnel_id uuid NOT NULL REFERENCES public.recovery_funnels(id) ON DELETE CASCADE,
  bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (funnel_id, bot_id)
);

CREATE TABLE IF NOT EXISTS public.recovery_funnel_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id uuid NOT NULL REFERENCES public.recovery_funnels(id) ON DELETE CASCADE,
  bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  tg_user_id bigint NOT NULL,
  chat_id bigint NOT NULL,
  step_position integer NOT NULL CHECK (step_position > 0),
  next_at timestamptz NOT NULL,
  locked_until timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (funnel_id, bot_id, tg_user_id)
);

CREATE INDEX IF NOT EXISTS recovery_funnel_runs_due_idx
  ON public.recovery_funnel_runs (next_at)
  WHERE completed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.recovery_funnel_media_cache (
  funnel_step_id uuid NOT NULL REFERENCES public.recovery_funnel_steps(id) ON DELETE CASCADE,
  bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  telegram_file_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (funnel_step_id, bot_id)
);

ALTER TABLE public.recovery_funnels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_funnel_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_funnel_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_funnel_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_funnel_media_cache ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_funnels TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_funnel_steps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_funnel_bots TO authenticated;
GRANT ALL ON public.recovery_funnel_runs TO service_role;
GRANT ALL ON public.recovery_funnel_media_cache TO service_role;

UPDATE public.bot_followups
SET completed_at = now(), updated_at = now()
WHERE completed_at IS NULL;

DROP POLICY IF EXISTS "owners manage recovery funnels" ON public.recovery_funnels;
CREATE POLICY "owners manage recovery funnels" ON public.recovery_funnels
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "owners manage recovery funnel steps" ON public.recovery_funnel_steps;
CREATE POLICY "owners manage recovery funnel steps" ON public.recovery_funnel_steps
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.recovery_funnels
      WHERE recovery_funnels.id = recovery_funnel_steps.funnel_id
        AND recovery_funnels.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.recovery_funnels
      WHERE recovery_funnels.id = recovery_funnel_steps.funnel_id
        AND recovery_funnels.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "owners manage recovery funnel bot assignments" ON public.recovery_funnel_bots;
CREATE POLICY "owners manage recovery funnel bot assignments" ON public.recovery_funnel_bots
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (
    owner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.bots
      WHERE bots.id = recovery_funnel_bots.bot_id AND bots.owner_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.recovery_funnels
      WHERE recovery_funnels.id = recovery_funnel_bots.funnel_id
        AND recovery_funnels.owner_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.claim_due_recovery_funnel_runs(_limit integer DEFAULT 100)
RETURNS TABLE (
  run_id uuid,
  funnel_id uuid,
  bot_id uuid,
  tg_user_id bigint,
  chat_id bigint,
  step_position integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT r.id
    FROM public.recovery_funnel_runs AS r
    WHERE r.completed_at IS NULL
      AND r.next_at <= now()
      AND (r.locked_until IS NULL OR r.locked_until <= now())
    ORDER BY r.next_at
    LIMIT greatest(1, least(coalesce(_limit, 100), 200))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.recovery_funnel_runs AS r
  SET locked_until = now() + interval '10 minutes',
      updated_at = now()
  FROM due
  WHERE r.id = due.id
  RETURNING r.id, r.funnel_id, r.bot_id, r.tg_user_id, r.chat_id, r.step_position;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_recovery_funnel_runs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_recovery_funnel_runs(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.save_recovery_funnel(
  _funnel_id uuid,
  _name text,
  _steps jsonb,
  _bot_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth
AS $$
DECLARE
  v_owner_id uuid := auth.uid();
  v_funnel_id uuid := coalesce(_funnel_id, gen_random_uuid());
BEGIN
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'É necessário entrar na conta.';
  END IF;
  IF _name IS NULL OR length(trim(_name)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'O nome do funil deve ter entre 1 e 100 caracteres.';
  END IF;
  IF coalesce(jsonb_typeof(_steps), 'null') <> 'array' THEN
    RAISE EXCEPTION 'As etapas do funil estão em formato inválido.';
  END IF;
  IF jsonb_array_length(_steps) < 1 THEN
    RAISE EXCEPTION 'Adicione ao menos uma etapa ao funil.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(coalesce(_bot_ids, ARRAY[]::uuid[])) AS chosen(bot_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.bots
      WHERE bots.id = chosen.bot_id AND bots.owner_id = v_owner_id
    )
  ) THEN
    RAISE EXCEPTION 'Um ou mais bots selecionados não pertencem a esta conta.';
  END IF;

  IF _funnel_id IS NULL THEN
    INSERT INTO public.recovery_funnels (id, owner_id, name)
    VALUES (v_funnel_id, v_owner_id, trim(_name));
  ELSE
    UPDATE public.recovery_funnels
    SET name = trim(_name), updated_at = now()
    WHERE id = _funnel_id AND owner_id = v_owner_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Funil não encontrado.';
    END IF;
  END IF;

  DELETE FROM public.recovery_funnel_steps WHERE funnel_id = v_funnel_id;
  INSERT INTO public.recovery_funnel_steps (
    funnel_id, position, delay_minutes, message_text, media_type, media_url
  )
  SELECT
    v_funnel_id,
    (step.value->>'position')::integer,
    (step.value->>'delay_minutes')::integer,
    step.value->>'message_text',
    nullif(step.value->>'media_type', ''),
    nullif(step.value->>'media_url', '')
  FROM jsonb_array_elements(_steps) AS step(value);

  DELETE FROM public.recovery_funnel_bots WHERE funnel_id = v_funnel_id;
  INSERT INTO public.recovery_funnel_bots (funnel_id, bot_id, owner_id)
  SELECT v_funnel_id, chosen.bot_id, v_owner_id
  FROM (
    SELECT DISTINCT bot_id
    FROM unnest(coalesce(_bot_ids, ARRAY[]::uuid[])) AS selected(bot_id)
  ) AS chosen;

  RETURN v_funnel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_recovery_funnel(uuid, text, jsonb, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_recovery_funnel(uuid, text, jsonb, uuid[]) TO authenticated;
