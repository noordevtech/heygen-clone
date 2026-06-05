-- Per-channel manual task queue. When the scheduler (or Fire-now) runs for a
-- channel, it picks the oldest pending row here as the topic instead of
-- brainstorming. Empty queue → fall back to brainstorm-and-pick.

CREATE TABLE IF NOT EXISTS "channel_tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'pending', -- pending | running | done | error
  "job_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "picked_at" timestamptz,
  "completed_at" timestamptz,
  "error" text
);

-- Hot path: "next pending task for this channel" + the channel-detail listing.
CREATE INDEX IF NOT EXISTS "channel_tasks_channel_status_created_idx"
  ON "channel_tasks" ("channel_id", "status", "created_at");
