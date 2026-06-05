import { sql } from "drizzle-orm";
import {
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  integer,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnyJobRequest } from "@/lib/types";

export const jobStatus = pgEnum("job_status", [
  "queued",
  "tts",
  "video",
  "image",
  "music",
  "compositing",
  "uploading",
  "done",
  "error",
]);

export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  status: jobStatus("status").notNull().default("queued"),
  progress: integer("progress").notNull().default(0),
  message: text("message"),
  request: jsonb("request").$type<AnyJobRequest>().notNull(),
  audioUrl: text("audio_url"),
  videoUrl: text("video_url"),
  thumbnailUrl: text("thumbnail_url"),
  musicUrl: text("music_url"),
  variants: jsonb("variants").$type<Partial<Record<"9:16" | "1:1" | "16:9", string>>>(),
  error: text("error"),
  /** When the job was triggered by a channel run, the channel id. NULL for
   *  manual (Studio / YouTube wizard) jobs. */
  channelId: uuid("channel_id"),
  /** YouTube watch URL stamped on the job after the auto-publish hook
   *  uploads it. NULL for jobs that weren't published. */
  youtubeUrl: text("youtube_url"),
  /** Owner of the job. Added in 0009 (nullable); existing rows backfilled
   *  to admin. New jobs from the UI write the current session user. */
  userId: uuid("user_id"),
});

export type JobRow = typeof jobs.$inferSelect;
export type JobInsert = typeof jobs.$inferInsert;

export const appSettings = pgTable(
  "app_settings",
  {
    /** Owner of this setting row. After migration 0010 settings are scoped
     *  per-user; admin's rows act as the platform defaults when a user
     *  hasn't configured a particular key. */
    userId: uuid("user_id").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.key] }),
  }),
);

export type AppSettingRow = typeof appSettings.$inferSelect;

export const channels = pgTable("channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  niche: text("niche").notNull(),
  /** "daily" | "weekly" | "monthly". Stored as text so we can add cadences
   *  later without a migration. Validated at the API/Zod layer. */
  schedule: text("schedule").notNull().default("daily"),
  /** Time of day the channel's automation should fire, HH:MM (24h). */
  runTime: text("run_time").notNull().default("09:00"),
  /** Target video length in minutes — passed to the Agent when firing. */
  targetLengthMin: integer("target_length_min").notNull().default(5),
  /** Style preset id (matches STYLE_PRESETS.id in catalog.ts). "none" by default. */
  style: text("style").notNull().default("none"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** Timestamp of the most recent scheduler/fire-now run. Defaults to row
   *  creation time so a freshly added channel doesn't immediately fire if its
   *  runTime has already passed today. */
  lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull().defaultNow(),
  /** "running" | "done" | "error" — snapshot of the most recent run. NULL until first run. */
  lastStatus: text("last_status"),
  lastJobId: uuid("last_job_id"),
  lastTitle: text("last_title"),
  lastVideoUrl: text("last_video_url"),
  lastYoutubeUrl: text("last_youtube_url"),
  lastError: text("last_error"),
  /** Owner. Added in migration 0009 (nullable); existing rows backfilled
   *  to the admin so the scheduler still has a user to run as. */
  userId: uuid("user_id"),
  /** Which YouTube connection this channel auto-publishes to (multi-channel
   *  support — migration 0011). NULL means no YT publishing happens. */
  youtubeConnectionId: uuid("youtube_connection_id"),
  /** ElevenLabs voice id used by the runner. NULL → runner picks the first
   *  available voice (legacy behaviour). */
  voiceId: text("voice_id"),
});

export type ChannelRow = typeof channels.$inferSelect;
export type ChannelInsert = typeof channels.$inferInsert;

// ---------------------------------------------------------------------------
// Auth — users + opaque session cookies.
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  /** "admin" | "user". Stored as text so additional roles can be added
   *  without a migration. Validated at the API layer. */
  role: text("role").notNull().default("user"),
  /** Admin-created accounts start inactive; the admin must flip this on
   *  before the user can log in. */
  active: boolean("active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdByUserId: uuid("created_by_user_id"),
});

export type UserRow = typeof users.$inferSelect;
export type UserInsert = typeof users.$inferInsert;

export const sessions = pgTable("sessions", {
  /** Opaque token stored in the user's HTTP-only cookie. */
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SessionRow = typeof sessions.$inferSelect;
export type SessionInsert = typeof sessions.$inferInsert;

// ---------------------------------------------------------------------------
// YouTube — multi-channel support. Each row is one connected Google account /
// YouTube channel; a single user can have many. A Tasks channel references one
// of these via `channels.youtubeConnectionId` to know where to publish.
// ---------------------------------------------------------------------------

export const youtubeConnections = pgTable("youtube_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  /** YouTube's channel id ("UCxxxx..."). Nullable for legacy rows lifted
   *  from app_settings — backfilled on first successful API call. */
  youtubeChannelId: text("youtube_channel_id"),
  channelTitle: text("channel_title").notNull(),
  channelThumbnailUrl: text("channel_thumbnail_url"),
  refreshToken: text("refresh_token").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type YoutubeConnectionRow = typeof youtubeConnections.$inferSelect;
export type YoutubeConnectionInsert = typeof youtubeConnections.$inferInsert;

// ---------------------------------------------------------------------------
// Per-channel manual task queue. When the scheduler fires, it pops the oldest
// pending row instead of brainstorming. Empty queue → brainstorm fallback.
// ---------------------------------------------------------------------------

export const channelTasks = pgTable("channel_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  channelId: uuid("channel_id").notNull(),
  userId: uuid("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  /** pending | running | done | error */
  status: text("status").notNull().default("pending"),
  /** Set when the runner claims this task; ties the row back to the produced job. */
  jobId: uuid("job_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  pickedAt: timestamp("picked_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  error: text("error"),
});

export type ChannelTaskRow = typeof channelTasks.$inferSelect;
export type ChannelTaskInsert = typeof channelTasks.$inferInsert;

// Convenience SQL identifiers used by the migration runner.
export const TOUCH_UPDATED_AT_TRIGGER = sql`
  CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
  BEGIN NEW.updated_at = now(); RETURN NEW; END;
  $$ LANGUAGE plpgsql;
`;
