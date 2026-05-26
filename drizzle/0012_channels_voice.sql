-- Per-channel voiceover selection. Up to now the runner used the first
-- ElevenLabs voice the user's API key returned, regardless of channel.
-- Adding `voice_id` lets each Task pick its own narrator from /api/voices.

ALTER TABLE "channels"
  ADD COLUMN IF NOT EXISTS "voice_id" text;
