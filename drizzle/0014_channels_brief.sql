-- Per-channel free-form brief — a "CLAUDE.md for this channel" that the
-- agent reads alongside the niche when brainstorming + writing scripts.
-- NULL means no extra context; the runner falls back to using just `niche`.

ALTER TABLE "channels"
  ADD COLUMN IF NOT EXISTS "brief" text;
