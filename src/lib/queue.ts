import { Queue, type ConnectionOptions } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var __redis__: IORedis | undefined;
  // eslint-disable-next-line no-var
  var __videoQueue__: Queue<VideoJobPayload> | undefined;
}

export type VideoJobPayload = { jobId: string };

export const VIDEO_QUEUE = "video-generation";

export function redisConnection(): ConnectionOptions {
  if (!global.__redis__) {
    global.__redis__ = new IORedis(env.redisUrl(), {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return global.__redis__;
}

export function videoQueue(): Queue<VideoJobPayload> {
  if (!global.__videoQueue__) {
    global.__videoQueue__ = new Queue<VideoJobPayload>(VIDEO_QUEUE, {
      connection: redisConnection(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
        removeOnFail: { age: 60 * 60 * 24 * 7 },
      },
    });
  }
  return global.__videoQueue__;
}

export async function enqueueVideoJob(jobId: string): Promise<void> {
  await videoQueue().add("generate", { jobId }, { jobId });
}
