ALTER TABLE "channels"
  ADD COLUMN IF NOT EXISTS "target_length_min" integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "style" text NOT NULL DEFAULT 'none';
