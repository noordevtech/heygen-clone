import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { channelTasks, type ChannelTaskRow } from "@/db/schema";

export type ChannelTaskStatus = "pending" | "running" | "done" | "error";

export type ChannelTask = {
  id: string;
  channelId: string;
  userId: string;
  title: string;
  description: string;
  status: ChannelTaskStatus;
  jobId: string | null;
  createdAt: number;
  pickedAt: number | null;
  completedAt: number | null;
  error: string | null;
};

function rowToTask(row: ChannelTaskRow): ChannelTask {
  const status =
    row.status === "pending" || row.status === "running" || row.status === "done" || row.status === "error"
      ? row.status
      : "pending";
  return {
    id: row.id,
    channelId: row.channelId,
    userId: row.userId,
    title: row.title,
    description: row.description ?? "",
    status,
    jobId: row.jobId ?? null,
    createdAt: row.createdAt.getTime(),
    pickedAt: row.pickedAt ? row.pickedAt.getTime() : null,
    completedAt: row.completedAt ? row.completedAt.getTime() : null,
    error: row.error ?? null,
  };
}

/** Newest-first list of every task ever queued on this channel. */
export async function listChannelTasks(channelId: string): Promise<ChannelTask[]> {
  const rows = await db
    .select()
    .from(channelTasks)
    .where(eq(channelTasks.channelId, channelId))
    .orderBy(desc(channelTasks.createdAt));
  return rows.map(rowToTask);
}

export async function createChannelTask(input: {
  channelId: string;
  userId: string;
  title: string;
  description?: string;
}): Promise<ChannelTask> {
  const [row] = await db
    .insert(channelTasks)
    .values({
      channelId: input.channelId,
      userId: input.userId,
      title: input.title.trim(),
      description: (input.description ?? "").trim(),
    })
    .returning();
  return rowToTask(row);
}

/** Edit a pending task. Refuses to touch tasks that have already been
 *  claimed by the runner so a mid-flight edit can't change the brief Claude
 *  is currently writing against. Returns null if the task is gone or no
 *  longer pending. */
export async function updateChannelTask(
  id: string,
  input: { title?: string; description?: string },
): Promise<ChannelTask | null> {
  const patch: Partial<typeof channelTasks.$inferInsert> = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.description !== undefined) patch.description = input.description.trim();
  if (Object.keys(patch).length === 0) {
    const [existing] = await db.select().from(channelTasks).where(eq(channelTasks.id, id)).limit(1);
    return existing ? rowToTask(existing) : null;
  }
  const [row] = await db
    .update(channelTasks)
    .set(patch)
    .where(and(eq(channelTasks.id, id), eq(channelTasks.status, "pending")))
    .returning();
  return row ? rowToTask(row) : null;
}

/** Delete a pending task. Refuses to delete tasks that are running / done /
 *  error so we don't lose the audit trail of "this task produced job X". */
export async function deleteChannelTask(id: string): Promise<boolean> {
  const result = await db
    .delete(channelTasks)
    .where(and(eq(channelTasks.id, id), eq(channelTasks.status, "pending")))
    .returning({ id: channelTasks.id });
  return result.length > 0;
}

/**
 * Atomically claim the oldest pending task for this channel — marks it
 * "running", stamps pickedAt, and returns it. Returns null when the queue is
 * empty. The UPDATE … WHERE id = (SELECT … LIMIT 1) pattern keeps two
 * scheduler ticks from grabbing the same row.
 */
export async function claimNextChannelTask(channelId: string): Promise<ChannelTask | null> {
  // drizzle-orm with postgres-js: use sql.raw inside a subquery for the
  // LIMIT 1 select to keep things atomic in a single statement.
  const result = await db
    .update(channelTasks)
    .set({ status: "running", pickedAt: new Date() })
    .where(
      and(
        eq(channelTasks.status, "pending"),
        inArray(
          channelTasks.id,
          db
            .select({ id: channelTasks.id })
            .from(channelTasks)
            .where(and(eq(channelTasks.channelId, channelId), eq(channelTasks.status, "pending")))
            .orderBy(asc(channelTasks.createdAt))
            .limit(1),
        ),
      ),
    )
    .returning();
  const row = result[0];
  return row ? rowToTask(row) : null;
}

export async function attachTaskJob(id: string, jobId: string): Promise<void> {
  await db.update(channelTasks).set({ jobId }).where(eq(channelTasks.id, id));
}

/** Used by the worker's post-publish hook to mark the queued task done /
 *  error without the caller having to know the task id. Returns null if no
 *  task was linked to this job (the run was a brainstorm fallback). */
export async function getChannelTaskByJobId(jobId: string): Promise<ChannelTask | null> {
  const [row] = await db
    .select()
    .from(channelTasks)
    .where(eq(channelTasks.jobId, jobId))
    .limit(1);
  return row ? rowToTask(row) : null;
}

export async function completeChannelTask(id: string): Promise<void> {
  await db
    .update(channelTasks)
    .set({ status: "done", completedAt: new Date(), error: null })
    .where(eq(channelTasks.id, id));
}

export async function failChannelTask(id: string, error: string): Promise<void> {
  await db
    .update(channelTasks)
    .set({ status: "error", completedAt: new Date(), error: error.slice(0, 2000) })
    .where(eq(channelTasks.id, id));
}

/** Used by the channel-runner's topic-dedup pass alongside past job titles. */
export async function pendingTaskCount(channelId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(channelTasks)
    .where(and(eq(channelTasks.channelId, channelId), eq(channelTasks.status, "pending")));
  return row?.n ?? 0;
}
