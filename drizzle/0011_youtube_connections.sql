-- Multi-channel YouTube: a user can connect more than one YouTube account.
-- Up to now each user had a single (youtube_refresh_token, youtube_channel_title)
-- pair in app_settings — connecting again would overwrite the first. Move
-- those into a proper `youtube_connections` table (one row per connected
-- channel) and let `channels` pick which connection to publish to.

CREATE TABLE IF NOT EXISTS "youtube_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  /** YouTube's own channel id, e.g. "UCxxxx...". Nullable for legacy rows
   *  migrated from app_settings — the first successful API call will backfill it. */
  "youtube_channel_id" text,
  "channel_title" text NOT NULL,
  "channel_thumbnail_url" text,
  /** Long-lived Google OAuth refresh token. Treat as a secret. */
  "refresh_token" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "youtube_connections_user_id_idx" ON "youtube_connections"("user_id");

ALTER TABLE "channels"
  ADD COLUMN IF NOT EXISTS "youtube_connection_id" uuid;

-- Backfill: lift any existing (youtube_refresh_token, youtube_channel_title)
-- pairs into the new table and link the user's channels to the new row.
DO $$
DECLARE
  rec RECORD;
  new_conn_id uuid;
BEGIN
  FOR rec IN
    SELECT s1.user_id, s1.value AS refresh_token,
           COALESCE(s2.value, 'YouTube channel') AS channel_title
      FROM app_settings s1
      LEFT JOIN app_settings s2
        ON s1.user_id = s2.user_id AND s2.key = 'youtube_channel_title'
     WHERE s1.key = 'youtube_refresh_token'
       AND s1.value <> ''
  LOOP
    INSERT INTO youtube_connections (user_id, channel_title, refresh_token)
    VALUES (rec.user_id, rec.channel_title, rec.refresh_token)
    RETURNING id INTO new_conn_id;

    UPDATE channels
       SET youtube_connection_id = new_conn_id
     WHERE user_id = rec.user_id
       AND youtube_connection_id IS NULL;
  END LOOP;
END$$;

-- The legacy settings rows are now redundant.
DELETE FROM app_settings
 WHERE key IN ('youtube_refresh_token', 'youtube_channel_title');
