-- Web upgrade: bot funnels, per-bot plan visibility and a global seller ranking.
ALTER TABLE public.bots
  ADD COLUMN IF NOT EXISTS offer_button_text text NOT NULL DEFAULT 'Ver planos',
  ADD COLUMN IF NOT EXISTS follow_up_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS follow_up_1_text text NOT NULL DEFAULT 'Ainda está pensando? Confira os planos disponíveis.',
  ADD COLUMN IF NOT EXISTS follow_up_2_text text NOT NULL DEFAULT 'Sua prévia VIP continua disponível. Escolha um plano quando quiser.',
  ADD COLUMN IF NOT EXISTS follow_up_3_text text NOT NULL DEFAULT 'Último lembrete: toque no botão para conhecer os planos.',
  ADD COLUMN IF NOT EXISTS follow_up_1_delay_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS follow_up_2_delay_minutes integer NOT NULL DEFAULT 1440,
  ADD COLUMN IF NOT EXISTS follow_up_3_delay_minutes integer NOT NULL DEFAULT 4320;

ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS all_bots boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bot_ids uuid[] NOT NULL DEFAULT '{}';

ALTER TABLE public.bots DROP CONSTRAINT IF EXISTS bots_follow_up_delays_check;
ALTER TABLE public.bots ADD CONSTRAINT bots_follow_up_delays_check CHECK (
  follow_up_1_delay_minutes BETWEEN 1 AND 525600
  AND follow_up_2_delay_minutes BETWEEN 1 AND 525600
  AND follow_up_3_delay_minutes BETWEEN 1 AND 525600
);

CREATE TABLE IF NOT EXISTS public.bot_followups (
  bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  tg_user_id bigint NOT NULL,
  chat_id bigint NOT NULL,
  attempt smallint NOT NULL DEFAULT 0 CHECK (attempt BETWEEN 0 AND 3),
  next_at timestamptz NOT NULL,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bot_id, tg_user_id)
);
CREATE INDEX IF NOT EXISTS bot_followups_due_idx ON public.bot_followups (next_at)
  WHERE completed_at IS NULL;
ALTER TABLE public.bot_followups ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.bot_followups TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_bot_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.owner_id IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bot-limit:' || NEW.owner_id::text));
  IF (SELECT count(*) FROM public.bots WHERE owner_id = NEW.owner_id AND id <> NEW.id) >= 100 THEN
    RAISE EXCEPTION 'Limite de 100 bots por conta atingido' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE INDEX IF NOT EXISTS transactions_global_seller_ranking_idx
  ON public.transactions (owner_id)
  WHERE kind = 'sale' AND status = 'paid';

CREATE OR REPLACE FUNCTION public.get_global_seller_ranking(_limit integer DEFAULT 100)
RETURNS TABLE (
  ranking_position bigint,
  username text,
  display_name text,
  approved_sales bigint,
  total_sellers bigint,
  all_approved_sales bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH seller_sales AS (
    SELECT t.owner_id, count(*)::bigint AS approved_sales
    FROM public.transactions AS t
    WHERE t.kind = 'sale' AND t.status = 'paid' AND t.owner_id IS NOT NULL
    GROUP BY t.owner_id
  ),
  visible_sellers AS (
    SELECT
      p.username,
      coalesce(nullif(p.display_name, ''), p.username) AS display_name,
      s.approved_sales
    FROM seller_sales AS s
    JOIN public.profiles AS p ON p.id = s.owner_id
    WHERE nullif(p.username, '') IS NOT NULL
  ),
  ranked AS (
    SELECT
      row_number() OVER (ORDER BY approved_sales DESC, username) AS ranking_position,
      username,
      display_name,
      approved_sales
    FROM visible_sellers
  ),
  totals AS (
    SELECT count(*)::bigint AS total_sellers, coalesce(sum(approved_sales), 0)::bigint AS all_approved_sales
    FROM visible_sellers
  )
  SELECT r.ranking_position, r.username, r.display_name, r.approved_sales, totals.total_sellers, totals.all_approved_sales
  FROM totals
  LEFT JOIN LATERAL (
    SELECT ranked.*
    FROM ranked
    ORDER BY ranked.ranking_position
    LIMIT greatest(1, least(coalesce(_limit, 100), 100))
  ) AS r ON true
  ORDER BY r.ranking_position NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.get_global_seller_ranking(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_global_seller_ranking(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_due_bot_followups(_limit integer DEFAULT 100)
RETURNS TABLE (bot_id uuid, tg_user_id bigint, chat_id bigint, attempt smallint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT f.bot_id, f.tg_user_id
    FROM public.bot_followups AS f
    WHERE f.completed_at IS NULL AND f.next_at <= now()
    ORDER BY f.next_at
    LIMIT greatest(1, least(coalesce(_limit, 100), 200))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.bot_followups AS f
  SET next_at = now() + interval '10 minutes', updated_at = now()
  FROM due
  WHERE f.bot_id = due.bot_id AND f.tg_user_id = due.tg_user_id
  RETURNING f.bot_id, f.tg_user_id, f.chat_id, f.attempt;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_due_bot_followups(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_bot_followups(integer) TO service_role;
