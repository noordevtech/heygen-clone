import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { youtubeConnections, type YoutubeConnectionRow } from "@/db/schema";

export type YoutubeConnection = {
  id: string;
  userId: string;
  youtubeChannelId: string | null;
  channelTitle: string;
  channelThumbnailUrl: string | null;
  createdAt: number;
  updatedAt: number;
};

/** Same as YoutubeConnection but carries the refresh token. Server-only —
 *  the refresh token must never leak to the browser. */
export type YoutubeConnectionWithToken = YoutubeConnection & {
  refreshToken: string;
};

function rowToPublic(row: YoutubeConnectionRow): YoutubeConnection {
  return {
    id: row.id,
    userId: row.userId,
    youtubeChannelId: row.youtubeChannelId ?? null,
    channelTitle: row.channelTitle,
    channelThumbnailUrl: row.channelThumbnailUrl ?? null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

function rowToFull(row: YoutubeConnectionRow): YoutubeConnectionWithToken {
  return { ...rowToPublic(row), refreshToken: row.refreshToken };
}

export async function listConnections(userId: string): Promise<YoutubeConnection[]> {
  const rows = await db
    .select()
    .from(youtubeConnections)
    .where(eq(youtubeConnections.userId, userId))
    .orderBy(desc(youtubeConnections.createdAt));
  return rows.map(rowToPublic);
}

/** Resolve a connection by id WITH its refresh token. Verifies ownership. */
export async function getConnectionWithToken(
  id: string,
  userId: string,
): Promise<YoutubeConnectionWithToken | null> {
  const [row] = await db
    .select()
    .from(youtubeConnections)
    .where(and(eq(youtubeConnections.id, id), eq(youtubeConnections.userId, userId)))
    .limit(1);
  return row ? rowToFull(row) : null;
}

/** Resolve a connection by id without an ownership check — for the worker's
 *  channel-runner, which has already established the channel owner via its
 *  own ALS context. */
export async function getConnectionWithTokenById(
  id: string,
): Promise<YoutubeConnectionWithToken | null> {
  const [row] = await db
    .select()
    .from(youtubeConnections)
    .where(eq(youtubeConnections.id, id))
    .limit(1);
  return row ? rowToFull(row) : null;
}

export type CreateConnectionInput = {
  userId: string;
  refreshToken: string;
  channelTitle: string;
  youtubeChannelId?: string | null;
  channelThumbnailUrl?: string | null;
};

/**
 * Create a new connection row. We deliberately allow duplicate
 * youtubeChannelId values for the same user — Google's OAuth flow can
 * produce a fresh refresh token even for an already-connected channel,
 * and we'd rather have an extra row than fail the connect button. The
 * UI lets the user delete duplicates.
 */
export async function createConnection(
  input: CreateConnectionInput,
): Promise<YoutubeConnection> {
  const [row] = await db
    .insert(youtubeConnections)
    .values({
      userId: input.userId,
      refreshToken: input.refreshToken,
      channelTitle: input.channelTitle,
      youtubeChannelId: input.youtubeChannelId ?? null,
      channelThumbnailUrl: input.channelThumbnailUrl ?? null,
    })
    .returning();
  return rowToPublic(row);
}

export type UpdateConnectionPatch = {
  channelTitle?: string;
  youtubeChannelId?: string | null;
  channelThumbnailUrl?: string | null;
  refreshToken?: string;
};

export async function updateConnection(
  id: string,
  patch: UpdateConnectionPatch,
): Promise<void> {
  const set: Partial<typeof youtubeConnections.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (patch.channelTitle !== undefined) set.channelTitle = patch.channelTitle;
  if (patch.youtubeChannelId !== undefined) set.youtubeChannelId = patch.youtubeChannelId;
  if (patch.channelThumbnailUrl !== undefined)
    set.channelThumbnailUrl = patch.channelThumbnailUrl;
  if (patch.refreshToken !== undefined) set.refreshToken = patch.refreshToken;
  await db.update(youtubeConnections).set(set).where(eq(youtubeConnections.id, id));
}

export async function deleteConnection(id: string, userId: string): Promise<boolean> {
  const res = await db
    .delete(youtubeConnections)
    .where(and(eq(youtubeConnections.id, id), eq(youtubeConnections.userId, userId)))
    .returning({ id: youtubeConnections.id });
  return res.length > 0;
}
