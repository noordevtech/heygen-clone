import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { channels, type ChannelRow } from "@/db/schema";

export type Schedule = "daily" | "weekly" | "monthly";

export type Channel = {
  id: string;
  name: string;
  niche: string;
  schedule: Schedule;
  runTime: string; // "HH:MM"
  targetLengthMin: number;
  style: string;
  createdAt: number;
};

function rowToChannel(row: ChannelRow): Channel {
  const schedule = (["daily", "weekly", "monthly"] as Schedule[]).includes(
    row.schedule as Schedule,
  )
    ? (row.schedule as Schedule)
    : "daily";
  return {
    id: row.id,
    name: row.name,
    niche: row.niche,
    schedule,
    runTime: row.runTime || "09:00",
    targetLengthMin: row.targetLengthMin ?? 5,
    style: row.style || "none",
    createdAt: row.createdAt.getTime(),
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

export async function deleteChannel(id: string): Promise<boolean> {
  const result = await db.delete(channels).where(eq(channels.id, id)).returning({ id: channels.id });
  return result.length > 0;
}
