ALTER TYPE "job_status" ADD VALUE IF NOT EXISTS 'image';
ALTER TYPE "job_status" ADD VALUE IF NOT EXISTS 'music';

ALTER TABLE "jobs" ADD COLUMN IF NOT EXISTS "music_url" text;
