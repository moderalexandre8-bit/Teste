ALTER TABLE public.bots ADD COLUMN media_chat_id bigint;
ALTER TABLE public.bots ADD COLUMN group_photos boolean NOT NULL DEFAULT true;
ALTER TABLE public.bots ADD COLUMN group_videos boolean NOT NULL DEFAULT true;
ALTER TABLE public.spoilers ADD COLUMN tg_file_ids jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.spoilers.tg_file_ids IS 'Telegram file_id per bot id (file ids are bot-specific); filled from the media channel or first send';
UPDATE public.spoilers SET tg_file_ids = jsonb_build_object(bot_id::text, file_id) WHERE file_id IS NOT NULL AND bot_id IS NOT NULL;