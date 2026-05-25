import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { channels, type ChannelRow } from "@/db/schema";

export type Channel = {
  id: string;
  name: string;
  niche: string;
  createdAt: number;
};

function rowToChannel(row: ChannelRow): Channel {
  return {
    id: row.id,
    name: row.name,
    niche: row.niche,
    createdAt: row.createdAt.getTime(),
  };
}

export async function listChannels(): Promise<Channel[]> {
  const rows = await db.select().from(channels).orderBy(desc(channels.createdAt));
  return rows.map(rowToChannel);
}

export async function createChannel(name: string, niche: string): Promise<Channel> {
  const [row] = await db
    .insert(channels)
    .values({ name: name.trim(), niche: niche.trim() })
    .returning();
  return rowToChannel(row);
}

export async function deleteChannel(id: string): Promise<boolean> {
  const result = await db.delete(channels).where(eq(channels.id, id)).returning({ id: channels.id });
  return result.length > 0;
}
