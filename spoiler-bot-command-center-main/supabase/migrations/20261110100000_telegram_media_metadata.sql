ALTER TABLE public.spoilers
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS tg_message_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending', 'synced', 'partial'));

UPDATE public.spoilers
SET sync_status = 'synced'
WHERE tg_file_ids <> '{}'::jsonb
  AND sync_status = 'pending';

COMMENT ON COLUMN public.spoilers.tg_file_ids IS
  'Telegram file_id per bot id; new uploads are sent to the bot media channel before metadata is saved.';
COMMENT ON COLUMN public.spoilers.tg_message_ids IS
  'Telegram media-channel message_id per bot id.';
COMMENT ON COLUMN public.spoilers.sync_status IS
  'Telegram upload status: pending, synced, or partial.';
