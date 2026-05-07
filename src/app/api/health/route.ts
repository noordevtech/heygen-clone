import { NextResponse } from "next/server";
import { videoQueue } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health — quick diagnostics for "is the queue alive and is anyone
 * consuming from it?". Counts come from Redis, worker count comes from BullMQ.
 */
export async function GET() {
  try {
    const q = videoQueue();
    const [counts, workers] = await Promise.all([
      q.getJobCounts("waiting", "active", "completed", "failed", "delayed"),
      q.getWorkers(),
    ]);
    return NextResponse.json({
      ok: true,
      queue: counts,
      workers: workers.length,
      workerIds: workers.map((w) => w.id ?? null),
      hint:
        workers.length === 0
          ? "No workers connected. Make sure your Railway 'worker' service is deployed and Active, with the same REDIS_URL as the web service."
          : counts.active > 0
            ? "Worker is processing a job."
            : counts.waiting > 0
              ? "Jobs are queued but no worker is picking them up."
              : "Idle and healthy.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
