import { Worker } from "bullmq";
import { runPipeline } from "@/lib/pipeline";
import { runLongformPipeline } from "@/lib/longform";
import { runHeygenPipeline } from "@/lib/heygen-pipeline";
import { getJob } from "@/lib/jobs";
import { VIDEO_QUEUE, redisConnection, type VideoJobPayload } from "@/lib/queue";
import { getDueChannels } from "@/lib/channels";
import { runChannelAgentAndQueue, runChannelAutoPublish } from "@/lib/channel-runner";
import { getAdminUserId, runWithUser } from "@/lib/user-context";

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 2);

const worker = new Worker<VideoJobPayload>(
  VIDEO_QUEUE,
  async (job) => {
    const { jobId } = job.data;
    const dbJob = await getJob(jobId);
    if (!dbJob) throw new Error(`Job ${jobId} not found in DB`);
    // Run the pipeline in the job-owner's user context so the resolver
    // picks up their API keys + YouTube token (with admin's keys as
    // fallback). Legacy jobs with no user_id fall back to admin.
    const ownerId = dbJob.userId ?? (await getAdminUserId());
    await runWithUser(ownerId, async () => {
      if (dbJob.request.kind === "longform") {
        await runLongformPipeline(jobId, dbJob.request);
        if (dbJob.request.channelId && dbJob.request.autoPublish) {
          try {
            await runChannelAutoPublish(jobId, dbJob.request.channelId);
          } catch (err) {
            console.error(
              `[worker] auto-publish failed for job ${jobId}:`,
              err instanceof Error ? err.message : err,
            );
          }
        }
      } else if (dbJob.request.kind === "heygen") {
        await runHeygenPipeline(jobId, dbJob.request);
      } else {
        await runPipeline(jobId, dbJob.request);
      }
    });
  },
  {
    connection: redisConnection(),
    concurrency,
    lockDuration: 45 * 60 * 1000,
  },
);

worker.on("ready", () => {
  console.log(`[worker] ready (queue=${VIDEO_QUEUE} concurrency=${concurrency})`);
});
worker.on("active", (job) => console.log(`[worker] active id=${job.id}`));
worker.on("completed", (job) => console.log(`[worker] completed id=${job.id}`));
worker.on("failed", (job, err) =>
  console.error(`[worker] failed id=${job?.id}: ${err?.message ?? err}`),
);

// ---------------------------------------------------------------------------
// Channel scheduler — fires due channels (`Tasks` page) at their `runTime`.
//
// Scans every user's channels (not scoped) and runs each fire in that
// channel-owner's user context so their API keys are used. SCHEDULER_DISABLED=1
// kills the tick on ad-hoc workers.
// ---------------------------------------------------------------------------

const SCHEDULER_INTERVAL_MS = 60_000;
let schedulerRunning = false;
let schedulerTimer: NodeJS.Timeout | null = null;

async function tickScheduler() {
  if (schedulerRunning) return;
  schedulerRunning = true;
  try {
    const due = await getDueChannels(new Date());
    if (due.length === 0) return;
    console.log(`[scheduler] firing ${due.length} channel(s): ${due.map((c) => c.name).join(", ")}`);
    const adminId = await getAdminUserId();
    for (const channel of due) {
      try {
        const ownerId = channel.userId ?? adminId;
        await runWithUser(ownerId, () => runChannelAgentAndQueue(channel.id));
      } catch (err) {
        console.error(
          `[scheduler] channel ${channel.name} (${channel.id}) failed:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  } catch (err) {
    console.error(`[scheduler] tick error:`, err instanceof Error ? err.message : err);
  } finally {
    schedulerRunning = false;
  }
}

if (process.env.SCHEDULER_DISABLED !== "1") {
  schedulerTimer = setInterval(() => void tickScheduler(), SCHEDULER_INTERVAL_MS);
  void tickScheduler();
  console.log(`[scheduler] enabled — tick every ${SCHEDULER_INTERVAL_MS / 1000}s`);
} else {
  console.log(`[scheduler] disabled via SCHEDULER_DISABLED=1`);
}

async function shutdown(signal: string) {
  console.log(`[worker] received ${signal}, shutting down`);
  if (schedulerTimer) clearInterval(schedulerTimer);
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
