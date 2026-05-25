import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { channels, type ChannelRow } from "@/db/schema";

export type Schedule = "daily" | "weekly" | "monthly";

export type ChannelRunStatus = "running" | "done" | "error";

export type Channel = {
  id: string;
  name: string;
  niche: string;
  schedule: Schedule;
  runTime: string; // "HH:MM"
  targetLengthMin: number;
  style: string;
  createdAt: number;
  lastRunAt: number;
  lastStatus: ChannelRunStatus | null;
  lastJobId: string | null;
  lastTitle: string | null;
  lastVideoUrl: string | null;
  lastYoutubeUrl: string | null;
  lastError: string | null;
};

function rowToChannel(row: ChannelRow): Channel {
  const schedule = (["daily", "weekly", "monthly"] as Schedule[]).includes(
    row.schedule as Schedule,
  )
    ? (row.schedule as Schedule)
    : "daily";
  const lastStatus =
    row.lastStatus === "running" || row.lastStatus === "done" || row.lastStatus === "error"
      ? row.lastStatus
      : null;
  return {
    id: row.id,
    name: row.name,
    niche: row.niche,
    schedule,
    runTime: row.runTime || "09:00",
    targetLengthMin: row.targetLengthMin ?? 5,
    style: row.style || "none",
    createdAt: row.createdAt.getTime(),
    lastRunAt: row.lastRunAt.getTime(),
    lastStatus,
    lastJobId: row.lastJobId ?? null,
    lastTitle: row.lastTitle ?? null,
    lastVideoUrl: row.lastVideoUrl ?? null,
    lastYoutubeUrl: row.lastYoutubeUrl ?? null,
    lastError: row.lastError ?? null,
  };
}

export type CreateChannelInput = {
  name: string;
  niche: string;
  schedule?: Schedule;
  runTime?: string;
  targetLengthMin?: number;
  style?: string;
};

export async function listChannels(): Promise<Channel[]> {
  const rows = await db.select().from(channels).orderBy(desc(channels.createdAt));
  return rows.map(rowToChannel);
}

export async function getChannel(id: string): Promise<Channel | null> {
  const [row] = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
  return row ? rowToChannel(row) : null;
}

export async function createChannel(input: CreateChannelInput): Promise<Channel> {
  const [row] = await db
    .insert(channels)
    .values({
      name: input.name.trim(),
      niche: input.niche.trim(),
      schedule: input.schedule ?? "daily",
      runTime: input.runTime ?? "09:00",
      targetLengthMin: input.targetLengthMin ?? 5,
      style: input.style ?? "none",
    })
    .returning();
  return rowToChannel(row);
}

export type UpdateChannelInput = Partial<CreateChannelInput>;

export async function updateChannel(
  id: string,
  input: UpdateChannelInput,
): Promise<Channel | null> {
  const patch: Partial<typeof channels.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.niche !== undefined) patch.niche = input.niche.trim();
  if (input.schedule !== undefined) patch.schedule = input.schedule;
  if (input.runTime !== undefined) patch.runTime = input.runTime;
  if (input.targetLengthMin !== undefined) patch.targetLengthMin = input.targetLengthMin;
  if (input.style !== undefined) patch.style = input.style;
  if (Object.keys(patch).length === 0) return getChannel(id);
  const [row] = await db.update(channels).set(patch).where(eq(channels.id, id)).returning();
  return row ? rowToChannel(row) : null;
}

export async function deleteChannel(id: string): Promise<boolean> {
  const result = await db.delete(channels).where(eq(channels.id, id)).returning({ id: channels.id });
  return result.length > 0;
}

// ---------------------------------------------------------------------------
// Run-state helpers — used by the scheduler + the worker's post-publish hook.
// ---------------------------------------------------------------------------

export type ChannelRunUpdate = {
  status: ChannelRunStatus;
  jobId?: string | null;
  title?: string | null;
  videoUrl?: string | null;
  youtubeUrl?: string | null;
  error?: string | null;
  /** When true, bump lastRunAt to now. Used at run-start to claim the slot
   *  so the scheduler tick doesn't double-fire while a run is in flight. */
  touch?: boolean;
};

export async function recordChannelRun(id: string, update: ChannelRunUpdate): Promise<void> {
  const patch: Partial<typeof channels.$inferInsert> = {
    lastStatus: update.status,
  };
  if (update.touch) patch.lastRunAt = new Date();
  if (update.jobId !== undefined) patch.lastJobId = update.jobId;
  if (update.title !== undefined) patch.lastTitle = update.title;
  if (update.videoUrl !== undefined) patch.lastVideoUrl = update.videoUrl;
  if (update.youtubeUrl !== undefined) patch.lastYoutubeUrl = update.youtubeUrl;
  if (update.error !== undefined) patch.lastError = update.error;
  await db.update(channels).set(patch).where(eq(channels.id, id));
}

/**
 * Compute today's `runTime` instant for a channel, in the server's local
 * timezone (Railway = UTC). Returns a Date pinned to the same calendar day
 * as `now`.
 */
function todayRunInstant(channel: Channel, now: Date): Date {
  const [hh, mm] = channel.runTime.split(":").map((n) => Number(n) || 0);
  const d = new Date(now);
  d.setHours(hh, mm, 0, 0);
  return d;
}

/**
 * Schedule-cadence gate. `daily` fires every day; `weekly` fires on the same
 * day-of-week as the channel was created; `monthly` fires on the same
 * day-of-month (clamped to the month length).
 */
function cadenceMatches(channel: Channel, now: Date): boolean {
  const created = new Date(channel.createdAt);
  switch (channel.schedule) {
    case "daily":
      return true;
    case "weekly":
      return now.getDay() === created.getDay();
    case "monthly": {
      // Last day of `now`'s month — for channels created on the 31st in
      // shorter months, fire on the last available day.
      const lastDom = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const wantedDom = Math.min(created.getDate(), lastDom);
      return now.getDate() === wantedDom;
    }
  }
}

/**
 * Channels eligible to fire right now. A channel fires if:
 *  - its schedule cadence matches today,
 *  - the current wall clock is past today's runTime,
 *  - and its `lastRunAt` is before today's runTime (i.e. it hasn't run yet
 *    in this window).
 */
export async function getDueChannels(now: Date = new Date()): Promise<Channel[]> {
  const all = await listChannels();
  return all.filter((c) => {
    if (!cadenceMatches(c, now)) return false;
    const target = todayRunInstant(c, now);
    if (now < target) return false;
    return c.lastRunAt < target.getTime();
  });
}

