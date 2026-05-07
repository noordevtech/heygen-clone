import { randomUUID } from "node:crypto";
import type { Job, JobStatus, GenerateRequest } from "./types";

/**
 * In-memory job store. Survives the lifetime of the Node process only.
 * Replace with Postgres/Redis when promoting beyond MVP.
 */
const store = new Map<string, Job>();

export function createJob(request: GenerateRequest): Job {
  const now = Date.now();
  const job: Job = {
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
    status: "queued",
    progress: 0,
    request,
  };
  store.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return store.get(id);
}

export function listJobs(): Job[] {
  return [...store.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function updateJob(id: string, patch: Partial<Job>): Job {
  const cur = store.get(id);
  if (!cur) throw new Error(`Job ${id} not found`);
  const next: Job = { ...cur, ...patch, updatedAt: Date.now() };
  store.set(id, next);
  return next;
}

export function setStatus(id: string, status: JobStatus, progress: number, message?: string): Job {
  return updateJob(id, { status, progress, message });
}

export function failJob(id: string, error: unknown): Job {
  const msg = error instanceof Error ? error.message : String(error);
  return updateJob(id, { status: "error", error: msg, progress: 100 });
}
