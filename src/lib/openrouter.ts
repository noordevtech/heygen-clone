import { env } from "./env";
import { resolved } from "./settings";
import type { AspectRatio } from "./types";

/** Internal slug used by the OpenRouter wrapper to pick which model setting to read. */
export type OpenRouterVideoModel = "seedance" | "veo";

/**
 * OpenRouter Video Generation client.
 *
 * Uses the dedicated async video API (not chat-completions):
 *   POST /api/v1/videos        -> { id, polling_url, status }
 *   GET  /api/v1/videos/{id}   -> { status, unsigned_urls?, error?, usage? }
 *
 * Reference: https://openrouter.ai/docs/guides/overview/multimodal/video-generation
 */

async function modelSlug(model: OpenRouterVideoModel): Promise<string> {
  return model === "veo"
    ? await resolved.openrouterVeoModel()
    : await resolved.openrouterSeedanceModel();
}

async function authHeaders(): Promise<Record<string, string>> {
  return {
    "content-type": "application/json",
    accept: "application/json",
    authorization: `Bearer ${await resolved.openrouterApiKey()}`,
    "http-referer": env.openrouter.referer,
    "x-title": env.openrouter.appName,
  };
}

export type CreateVideoOptions = {
  model: OpenRouterVideoModel;
  prompt: string;
  aspect: AspectRatio;
  durationSec?: number;
  /** Generate native audio with the video (Seedance 1.5 Pro, Veo 3). */
  generateAudio?: boolean;
  /** Image-to-video: first/last frame URLs (or data URLs). */
  firstFrame?: string;
  lastFrame?: string;
  /** Reference images for character/style consistency. */
  references?: string[];
  /** Provider-side webhook on completion. */
  callbackUrl?: string;
};

export type CreateVideoJob = {
  id: string;
  polling_url: string;
  status: VideoJobStatus;
};

export type VideoJobStatus = "queued" | "in_progress" | "running" | "completed" | "failed" | "canceled";

export type VideoJobResult = {
  id: string;
  status: VideoJobStatus;
  polling_url?: string;
  unsigned_urls?: string[];
  error?: { code?: string; message: string } | string | null;
  usage?: Record<string, unknown>;
};

const DURATION_DEFAULTS: Record<OpenRouterVideoModel, number> = { seedance: 6, veo: 8 };

export async function createVideo(opts: CreateVideoOptions): Promise<CreateVideoJob> {
  const slug = await modelSlug(opts.model);
  const body: Record<string, unknown> = {
    model: slug,
    prompt: opts.prompt,
    aspect_ratio: opts.aspect,
    duration: opts.durationSec ?? DURATION_DEFAULTS[opts.model],
    generate_audio: opts.generateAudio ?? false,
  };

  const frames: Array<{ frame_type: "first_frame" | "last_frame"; image_url: string }> = [];
  if (opts.firstFrame) frames.push({ frame_type: "first_frame", image_url: opts.firstFrame });
  if (opts.lastFrame) frames.push({ frame_type: "last_frame", image_url: opts.lastFrame });
  if (frames.length) body.frame_images = frames;
  if (opts.references?.length) {
    body.input_references = opts.references.map((url) => ({ image_url: url }));
  }
  if (opts.callbackUrl) body.callback_url = opts.callbackUrl;

  const res = await fetch(`${env.openrouter.baseUrl}/videos`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`OpenRouter create video (${slug}) failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as Partial<CreateVideoJob>;
  if (!json.id || !json.polling_url) {
    throw new Error(`OpenRouter create video (${slug}) returned invalid payload: ${JSON.stringify(json)}`);
  }
  return { id: json.id, polling_url: json.polling_url, status: (json.status ?? "queued") as VideoJobStatus };
}

export async function getVideoJob(idOrUrl: string): Promise<VideoJobResult> {
  const url = idOrUrl.startsWith("http")
    ? idOrUrl
    : `${env.openrouter.baseUrl}/videos/${encodeURIComponent(idOrUrl)}`;
  const res = await fetch(url, { headers: await authHeaders(), cache: "no-store" });
  if (!res.ok) {
    throw new Error(`OpenRouter get video failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as VideoJobResult;
}

export type WaitOptions = {
  /** Total wait budget in ms. Default: 8 minutes. */
  timeoutMs?: number;
  /** Poll cadence in ms. Default: 6s. */
  intervalMs?: number;
  /** Called on every poll for progress reporting. */
  onTick?: (status: VideoJobResult) => void;
};

export async function waitForVideo(
  job: CreateVideoJob,
  opts: WaitOptions = {},
): Promise<{ videoUrl: string; result: VideoJobResult }> {
  const timeout = opts.timeoutMs ?? 8 * 60 * 1000;
  const interval = opts.intervalMs ?? 6_000;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const result = await getVideoJob(job.polling_url || job.id);
    opts.onTick?.(result);
    if (result.status === "completed") {
      const url = result.unsigned_urls?.[0];
      if (!url) throw new Error("Video job completed but unsigned_urls was empty");
      return { videoUrl: url, result };
    }
    if (result.status === "failed" || result.status === "canceled") {
      const msg = typeof result.error === "string" ? result.error : result.error?.message;
      throw new Error(`Video job ${result.status}: ${msg ?? "(no error message)"}`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`Video job did not complete within ${Math.round(timeout / 1000)}s`);
}
