GRANT USAGE ON SCHEMA public TO authenticated, service_role;

GRANT SELECT ON TABLE public.bots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.spoilers TO authenticated;
GRANT ALL ON TABLE public.bots, public.bot_secrets, public.spoilers TO service_role;
GRANT EXECUTE ON FUNCTION public.owns_bot(uuid) TO authenticated;

ALTER TABLE public.bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spoilers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own bots read" ON public.bots;
CREATE POLICY "own bots read" ON public.bots
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "own spoilers" ON public.spoilers;
CREATE POLICY "own spoilers" ON public.spoilers
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (
    owner_id = auth.uid()
    AND (bot_id IS NULL OR public.owns_bot(bot_id))
  );
