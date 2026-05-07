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

// Convenience SQL identifiers used by the migration runner.
export const TOUCH_UPDATED_AT_TRIGGER = sql`
  CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
  BEGIN NEW.updated_at = now(); RETURN NEW; END;
  $$ LANGUAGE plpgsql;
`;
