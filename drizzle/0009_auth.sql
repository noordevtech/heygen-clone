-- Auth: users + sessions tables. Seeds the admin account
-- (info@noordev.com / Idig871y@) so the project ships with a working
-- admin login on first deploy. Existing rows in jobs/channels/app_settings
-- are tagged as the admin's, satisfying the request to link the API keys
-- and YouTube connection to the admin account.

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "role" text NOT NULL DEFAULT 'user',
  "active" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "created_by_user_id" uuid
);

CREATE INDEX IF NOT EXISTS "users_email_idx" ON "users" (lower("email"));

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" text PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "sessions_expires_at_idx" ON "sessions" ("expires_at");

-- Seed the admin account. Hash is bcryptjs (cost 12) of "Idig871y@".
-- ON CONFLICT keeps the existing row if migrate runs twice — we don't want
-- to overwrite a password the admin may have changed via the UI later.
INSERT INTO "users" ("email", "password_hash", "role", "active")
VALUES (
  'info@noordev.com',
  '$2b$12$eAQIcORWaSIBVoD7P0vtI.LQ/CH4XobiZrGxRUCSpVC2EAVRKKzlW',
  'admin',
  true
)
ON CONFLICT ("email") DO NOTHING;

-- Tag existing data with the admin user. New rows from authenticated
-- non-admin users (once we expose multi-user workflows) will write their
-- own user_id.
ALTER TABLE "app_settings"
  ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "jobs"
  ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "channels"
  ADD COLUMN IF NOT EXISTS "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;

UPDATE "app_settings"
   SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'info@noordev.com')
 WHERE "user_id" IS NULL;
UPDATE "jobs"
   SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'info@noordev.com')
 WHERE "user_id" IS NULL;
UPDATE "channels"
   SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'info@noordev.com')
 WHERE "user_id" IS NULL;
