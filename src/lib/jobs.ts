import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { jobs, type JobRow } from "@/db/schema";
import type { AnyJobRequest, Job, JobStatus } from "./types";

function rowToJob(row: JobRow): Job {
  return {
    id: row.id,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    status: row.status as JobStatus,
    progress: row.progress,
    message: row.message ?? undefined,
    request: row.request,
    audioUrl: row.audioUrl ?? undefined,
    videoUrl: row.videoUrl ?? undefined,
    thumbnailUrl: row.thumbnailUrl ?? undefined,
    musicUrl: row.musicUrl ?? undefined,
    variants: row.variants ?? undefined,
    error: row.error ?? undefined,
  };
}

export async function createJob(request: AnyJobRequest): Promise<Job> {
  // Pull channelId off longform requests so the column stays indexable for
  // future "all jobs for this channel" queries.
  const channelId =
    request.kind === "longform" && request.channelId ? request.channelId : null;
  const [row] = await db
    .insert(jobs)
    .values({ request, status: "queued", progress: 0, channelId })
    .returning();
  return rowToJob(row);
}

export async function getJob(id: string): Promise<Job | undefined> {
  const [row] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return row ? rowToJob(row) : undefined;
}

export async function listJobs(limit = 50): Promise<Job[]> {
  const rows = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(limit);
  return rows.map(rowToJob);
}

type Patch = Partial<{
  status: JobStatus;
  progress: number;
  message: string | null;
  audioUrl: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  musicUrl: string | null;
  variants: Job["variants"];
  error: string | null;
  /** Replace the full request JSONB. Used by the longform pipeline to write
   *  back probe results (e.g. per-scene audio durations) that the
   *  post-publish hook needs. */
  request: AnyJobRequest;
}>;

export async function updateJob(id: string, patch: Patch): Promise<Job> {
  const [row] = await db
    .update(jobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(jobs.id, id))
    .returning();
  if (!row) throw new Error(`Job ${id} not found`);
  return rowToJob(row);
}

export async function setStatus(
  id: string,
  status: JobStatus,
  progress: number,
  message?: string,
): Promise<Job> {
  return updateJob(id, { status, progress, message: message ?? null });
}

export async function failJob(id: string, error: unknown): Promise<Job> {
  const msg = error instanceof Error ? error.message : String(error);
  return updateJob(id, { status: "error", error: msg, progress: 100 });
}
