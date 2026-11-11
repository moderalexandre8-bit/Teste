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
