CREATE TABLE IF NOT EXISTS "app_settings" (
  "key" text PRIMARY KEY,
  "value" text NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
