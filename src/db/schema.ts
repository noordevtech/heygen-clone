import { sql } from "drizzle-orm";
import { jsonb, pgEnum, pgTable, text, timestamp, integer, uuid } from "drizzle-orm/pg-core";
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
});

export type JobRow = typeof jobs.$inferSelect;
export type JobInsert = typeof jobs.$inferInsert;

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
});

export type ChannelRow = typeof channels.$inferSelect;
export type ChannelInsert = typeof channels.$inferInsert;

// Convenience SQL identifiers used by the migration runner.
export const TOUCH_UPDATED_AT_TRIGGER = sql`
  CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
  BEGIN NEW.updated_at = now(); RETURN NEW; END;
  $$ LANGUAGE plpgsql;
`;
