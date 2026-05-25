-- Per-user settings. Up to now app_settings has been keyed by `key` alone,
-- with all rows owned by the admin (backfilled in 0009). Switch to a
-- composite PK so each user can have their own copy of every key. The
-- runtime resolver falls back to the admin's value when a user hasn't
-- configured a key, so the admin's existing keys act as platform defaults.

-- 0009 added user_id as nullable; lock it in before promoting it into the PK.
UPDATE "app_settings"
   SET "user_id" = (SELECT "id" FROM "users" WHERE "email" = 'info@noordev.com')
 WHERE "user_id" IS NULL;

ALTER TABLE "app_settings"
  ALTER COLUMN "user_id" SET NOT NULL;

ALTER TABLE "app_settings"
  DROP CONSTRAINT IF EXISTS "app_settings_pkey";

ALTER TABLE "app_settings"
  ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("user_id", "key");
