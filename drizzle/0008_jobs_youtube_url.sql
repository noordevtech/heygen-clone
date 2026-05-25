-- Persist the YouTube watch URL per job (instead of only on the channel's
-- last-run snapshot) so the Tasks → channel detail page can show the full
-- history of published videos. Same for the picked thumbnail.

ALTER TABLE "jobs"
  ADD COLUMN IF NOT EXISTS "youtube_url" text;
