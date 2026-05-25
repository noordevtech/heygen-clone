import { Worker } from "bullmq";
import { runPipeline } from "@/lib/pipeline";
import { runLongformPipeline } from "@/lib/longform";
import { runMinimaxPipeline } from "@/lib/minimax-pipeline";
import { getJob } from "@/lib/jobs";
import { VIDEO_QUEUE, redisConnection, type VideoJobPayload } from "@/lib/queue";
import { getDueChannels } from "@/lib/channels";
import { runChannelAgentAndQueue, runChannelAutoPublish } from "@/lib/channel-runner";

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 2);

const worker = new Worker<VideoJobPayload>(
  VIDEO_QUEUE,
  async (job) => {
    const { jobId } = job.data;
    const dbJob = await getJob(jobId);
    if (!dbJob) throw new Error(`Job ${jobId} not found in DB`);
    if (dbJob.request.kind === "longform") {
      await runLongformPipeline(jobId, dbJob.request);
      // Post-publish hook: if a channel triggered this job, hand the
      // finished video off to the YouTube uploader.
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
    } else if (dbJob.request.kind === "minimax") {
      await runMinimaxPipeline(jobId, dbJob.request);
    } else {
      await runPipeline(jobId, dbJob.request);
    }
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
// One process polls every minute. `getDueChannels` filters by schedule
// cadence + last-run-at, and `runChannelAgentAndQueue` marks the channel as
// running upfront so the next tick won't double-fire while a run is in
// flight. Disabled when SCHEDULER_DISABLED=1 for ad-hoc workers.
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
    // Run channels sequentially. Each one only blocks on the Claude calls
    // + Pexels — the heavy ffmpeg work happens off-thread in the BullMQ
    // worker. Sequential keeps Claude usage predictable.
    for (const channel of due) {
      try {
        await runChannelAgentAndQueue(channel.id);
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
  // Run once on startup so a missed slot (e.g. after a deploy) is caught
  // without waiting a full minute.
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
