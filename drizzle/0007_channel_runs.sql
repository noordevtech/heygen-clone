-- Wire the Tasks scheduler: jobs link back to the channel that triggered
-- them, and channels store a snapshot of their most recent run so the
-- Tasks page can show the latest published video without joining.

ALTER TABLE "jobs"
  ADD COLUMN IF NOT EXISTS "channel_id" uuid;

CREATE INDEX IF NOT EXISTS "jobs_channel_id_idx" ON "jobs" ("channel_id");

ALTER TABLE "channels"
  -- Defaulting to now() means rows that exist at migration time won't
  -- immediately fire when the scheduler starts (they look like they just ran).
  ADD COLUMN IF NOT EXISTS "last_run_at" timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "last_status" text,
  ADD COLUMN IF NOT EXISTS "last_job_id" uuid,
  ADD COLUMN IF NOT EXISTS "last_title" text,
  ADD COLUMN IF NOT EXISTS "last_video_url" text,
  ADD COLUMN IF NOT EXISTS "last_youtube_url" text,
  ADD COLUMN IF NOT EXISTS "last_error" text;
