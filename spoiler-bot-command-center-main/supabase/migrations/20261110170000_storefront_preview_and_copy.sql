ALTER TABLE public.owner_settings
  ADD COLUMN IF NOT EXISTS store_headline text,
  ADD COLUMN IF NOT EXISTS store_description text,
  ADD COLUMN IF NOT EXISTS store_preview_video_file_id text,
  ADD COLUMN IF NOT EXISTS store_preview_video_bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS store_preview_video_message_id bigint;
