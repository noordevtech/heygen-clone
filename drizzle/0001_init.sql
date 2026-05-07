DO $$ BEGIN
  CREATE TYPE "job_status" AS ENUM (
    'queued','tts','video','compositing','uploading','done','error'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "status" "job_status" NOT NULL DEFAULT 'queued',
  "progress" integer NOT NULL DEFAULT 0,
  "message" text,
  "request" jsonb NOT NULL,
  "audio_url" text,
  "video_url" text,
  "thumbnail_url" text,
  "variants" jsonb,
  "error" text
);

CREATE INDEX IF NOT EXISTS "jobs_created_at_idx" ON "jobs" ("created_at" DESC);
CREATE INDEX IF NOT EXISTS "jobs_status_idx" ON "jobs" ("status");
