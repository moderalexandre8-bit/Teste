CREATE TABLE public.bots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_bot_id bigint NOT NULL UNIQUE,
  username text NOT NULL,
  name text NOT NULL,
  photo_data text,
  active boolean NOT NULL DEFAULT true,
  welcome_text text NOT NULL DEFAULT 'Bem-vindo ao VIP!',
  cta_text text NOT NULL DEFAULT 'Escolha seu plano',
  after_payment_text text NOT NULL DEFAULT 'Pagamento confirmado! Aqui está seu acesso:',
  webhook_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bot_secrets (
  bot_id uuid PRIMARY KEY REFERENCES public.bots(id) ON DELETE CASCADE,
  token text NOT NULL,
  webhook_secret text NOT NULL DEFAULT encode(gen_random_bytes(32),'hex')
);
GRANT SELECT, UPDATE ON public.bots TO authenticated;
GRANT ALL ON public.bots TO service_role;
GRANT ALL ON public.bot_secrets TO service_role;
ALTER TABLE public.bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read" ON public.bots FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins update" ON public.bots FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

ALTER TABLE public.telegram_chats ADD COLUMN bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL;
ALTER TABLE public.chat_media ADD COLUMN bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL;
ALTER TABLE public.spoilers ADD COLUMN bot_id uuid REFERENCES public.bots(id) ON DELETE CASCADE;
ALTER TABLE public.telegram_users ADD COLUMN bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL;
ALTER TABLE public.subscriptions ADD COLUMN bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX chat_media_uniq ON public.chat_media (chat_id, message_id, file_id);

GRANT INSERT, UPDATE, DELETE ON public.plans, public.spoilers TO authenticated;
GRANT UPDATE ON public.bot_settings TO authenticated;
CREATE POLICY "admins write" ON public.plans FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins write" ON public.spoilers FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins update" ON public.bot_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE POLICY "admins manage bot media" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'bot-media' AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (bucket_id = 'bot-media' AND public.has_role(auth.uid(),'admin'));