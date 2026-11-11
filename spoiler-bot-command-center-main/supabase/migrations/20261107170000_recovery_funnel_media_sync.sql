CREATE TABLE IF NOT EXISTS public.recovery_funnel_step_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_step_id uuid NOT NULL REFERENCES public.recovery_funnel_steps(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 6),
  media_type text NOT NULL CHECK (media_type IN ('photo', 'video')),
  media_url text NOT NULL CHECK (length(trim(media_url)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (funnel_step_id, position)
);

INSERT INTO public.recovery_funnel_step_media (funnel_step_id, position, media_type, media_url)
SELECT id, 1, media_type, media_url
FROM public.recovery_funnel_steps
WHERE media_type IN ('photo', 'video') AND media_url IS NOT NULL
ON CONFLICT (funnel_step_id, position) DO NOTHING;

ALTER TABLE public.recovery_funnel_media_cache
  ADD COLUMN IF NOT EXISTS media_id uuid REFERENCES public.recovery_funnel_step_media(id) ON DELETE CASCADE;

UPDATE public.recovery_funnel_media_cache AS cache
SET media_id = (
  SELECT media.id
  FROM public.recovery_funnel_step_media AS media
  WHERE media.funnel_step_id = cache.funnel_step_id
  ORDER BY media.position
  LIMIT 1
)
WHERE cache.media_id IS NULL;

DELETE FROM public.recovery_funnel_media_cache WHERE media_id IS NULL;
ALTER TABLE public.recovery_funnel_media_cache ALTER COLUMN media_id SET NOT NULL;
ALTER TABLE public.recovery_funnel_media_cache
  DROP CONSTRAINT IF EXISTS recovery_funnel_media_cache_pkey;
ALTER TABLE public.recovery_funnel_media_cache
  ADD CONSTRAINT recovery_funnel_media_cache_pkey PRIMARY KEY (media_id, bot_id);

ALTER TABLE public.recovery_funnel_runs
  ADD COLUMN IF NOT EXISTS last_message_ids bigint[] NOT NULL DEFAULT '{}';

ALTER TABLE public.recovery_funnel_step_media ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recovery_funnel_step_media TO authenticated;
GRANT ALL ON public.recovery_funnel_step_media TO service_role;

DROP POLICY IF EXISTS "owners manage recovery funnel step media" ON public.recovery_funnel_step_media;
CREATE POLICY "owners manage recovery funnel step media" ON public.recovery_funnel_step_media
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.recovery_funnel_steps AS step
      JOIN public.recovery_funnels AS funnel ON funnel.id = step.funnel_id
      WHERE step.id = recovery_funnel_step_media.funnel_step_id
        AND funnel.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.recovery_funnel_steps AS step
      JOIN public.recovery_funnels AS funnel ON funnel.id = step.funnel_id
      WHERE step.id = recovery_funnel_step_media.funnel_step_id
        AND funnel.owner_id = auth.uid()
    )
  );

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
  v_step jsonb;
  v_first_media jsonb;
  v_step_id uuid;
  v_media_count integer;
  v_position integer;
BEGIN
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'É necessário entrar na conta.';
  END IF;
  IF _name IS NULL OR length(trim(_name)) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'O nome do funil deve ter entre 1 e 100 caracteres.';
  END IF;
  IF coalesce(jsonb_typeof(_steps), 'null') <> 'array' OR jsonb_array_length(_steps) < 1 THEN
    RAISE EXCEPTION 'Adicione ao menos uma etapa válida ao funil.';
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

  FOR v_step IN SELECT value FROM jsonb_array_elements(_steps)
  LOOP
    IF coalesce(jsonb_typeof(v_step->'media'), 'null') NOT IN ('array', 'null') THEN
      RAISE EXCEPTION 'A lista de mídias da etapa está inválida.';
    END IF;
    v_media_count := jsonb_array_length(coalesce(v_step->'media', '[]'::jsonb));
    IF v_media_count > 6 THEN
      RAISE EXCEPTION 'Cada etapa aceita no máximo 3 imagens e 3 vídeos.';
    END IF;
    IF (
      SELECT count(*) FROM jsonb_array_elements(coalesce(v_step->'media', '[]'::jsonb)) AS item(value)
      WHERE item.value->>'media_type' = 'photo'
    ) > 3 OR (
      SELECT count(*) FROM jsonb_array_elements(coalesce(v_step->'media', '[]'::jsonb)) AS item(value)
      WHERE item.value->>'media_type' = 'video'
    ) > 3 THEN
      RAISE EXCEPTION 'Cada etapa aceita no máximo 3 imagens e 3 vídeos.';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(v_step->'media', '[]'::jsonb)) AS item(value)
      WHERE item.value->>'media_type' NOT IN ('photo', 'video')
        OR coalesce(item.value->>'media_url', '') = ''
    ) THEN
      RAISE EXCEPTION 'Uma das mídias da etapa está inválida.';
    END IF;
  END LOOP;

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
  v_position := 0;
  FOR v_step IN SELECT value FROM jsonb_array_elements(_steps)
  LOOP
    v_position := v_position + 1;
    v_first_media := (v_step->'media')->0;
    IF v_first_media IS NULL AND v_step->>'media_url' IS NOT NULL THEN
      v_first_media := jsonb_build_object(
        'media_type', v_step->>'media_type',
        'media_url', v_step->>'media_url'
      );
    END IF;
    INSERT INTO public.recovery_funnel_steps (
      funnel_id, position, delay_minutes, message_text, media_type, media_url
    ) VALUES (
      v_funnel_id,
      v_position,
      (v_step->>'delay_minutes')::integer,
      v_step->>'message_text',
      nullif(v_first_media->>'media_type', ''),
      nullif(v_first_media->>'media_url', '')
    )
    RETURNING id INTO v_step_id;

    IF jsonb_array_length(coalesce(v_step->'media', '[]'::jsonb)) > 0 THEN
      INSERT INTO public.recovery_funnel_step_media (
        funnel_step_id, position, media_type, media_url
      )
      SELECT v_step_id, item.ordinality::integer, item.value->>'media_type', item.value->>'media_url'
      FROM jsonb_array_elements(v_step->'media') WITH ORDINALITY AS item(value, ordinality);
    ELSIF v_first_media IS NOT NULL THEN
      INSERT INTO public.recovery_funnel_step_media (
        funnel_step_id, position, media_type, media_url
      ) VALUES (
        v_step_id, 1, v_first_media->>'media_type', v_first_media->>'media_url'
      );
    END IF;
  END LOOP;

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
