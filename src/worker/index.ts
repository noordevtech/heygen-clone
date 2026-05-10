import { Worker } from "bullmq";
import { runPipeline } from "@/lib/pipeline";
import { runLongformPipeline } from "@/lib/longform";
import { runMinimaxPipeline } from "@/lib/minimax-pipeline";
import { getJob } from "@/lib/jobs";
import { VIDEO_QUEUE, redisConnection, type VideoJobPayload } from "@/lib/queue";

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 2);

const worker = new Worker<VideoJobPayload>(
  VIDEO_QUEUE,
  async (job) => {
    const { jobId } = job.data;
    const dbJob = await getJob(jobId);
    if (!dbJob) throw new Error(`Job ${jobId} not found in DB`);
    if (dbJob.request.kind === "longform") {
      await runLongformPipeline(jobId, dbJob.request);
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

async function shutdown(signal: string) {
  console.log(`[worker] received ${signal}, shutting down`);
  await worker.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
