import { resolved } from "./settings";

/**
 * MiniMax Hailuo video API client.
 *
 *   POST https://api.minimax.io/v1/video_generation       — create task
 *   GET  https://api.minimax.io/v1/query/video_generation — poll status
 *   GET  https://api.minimax.io/v1/files/retrieve         — fetch download URL
 *
 * Reference: https://platform.minimax.io/docs/api-reference/video-generation-t2v
 */

const BASE = "https://api.minimax.io/v1";

async function authHeaders(): Promise<Record<string, string>> {
  return {
    "content-type": "application/json",
    accept: "application/json",
    authorization: `Bearer ${await resolved.minimaxApiKey()}`,
  };
}

export type MinimaxCreateOptions = {
  model: string;
  prompt: string;
  /** Snake_case "1080P" | "768P". Optional. */
  resolution?: string;
  /** Seconds — typically 6 or 10. */
  duration?: number;
  /** Image-to-video starting frame. URL or base64 data URL. */
  firstFrameImage?: string;
  /** "16:9" | "9:16" | "1:1" — only honored by some models. */
  aspectRatio?: string;
  callbackUrl?: string;
};

type CreateResp = {
  task_id?: string;
  base_resp?: { status_code: number; status_msg: string };
};

export async function createVideoTask(opts: MinimaxCreateOptions): Promise<string> {
  const body: Record<string, unknown> = {
    model: opts.model,
    prompt: opts.prompt,
  };
  if (opts.resolution) body.resolution = opts.resolution;
  if (opts.duration) body.duration = opts.duration;
  if (opts.firstFrameImage) body.first_frame_image = opts.firstFrameImage;
  if (opts.aspectRatio) body.aspect_ratio = opts.aspectRatio;
  if (opts.callbackUrl) body.callback_url = opts.callbackUrl;

  const res = await fetch(`${BASE}/video_generation`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`MiniMax createVideoTask failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as CreateResp;
  if (!json.task_id) {
    const code = json.base_resp?.status_code;
    const msg = json.base_resp?.status_msg ?? JSON.stringify(json);
    throw new Error(`MiniMax createVideoTask returned no task_id (code=${code}): ${msg}`);
  }
  return json.task_id;
}

export type MinimaxStatus = "Preparing" | "Queueing" | "Processing" | "Success" | "Fail" | string;

type QueryResp = {
  task_id: string;
  status: MinimaxStatus;
  file_id?: string;
  base_resp?: { status_code: number; status_msg: string };
};

export async function queryVideoTask(taskId: string): Promise<QueryResp> {
  const res = await fetch(
    `${BASE}/query/video_generation?task_id=${encodeURIComponent(taskId)}`,
    { headers: await authHeaders(), cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`MiniMax queryVideoTask failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as QueryResp;
}

type FileResp = {
  file?: { file_id: number | string; download_url: string; backup_download_url?: string };
  base_resp?: { status_code: number; status_msg: string };
};

export async function retrieveFile(fileId: string): Promise<string> {
  const res = await fetch(
    `${BASE}/files/retrieve?file_id=${encodeURIComponent(fileId)}`,
    { headers: await authHeaders(), cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`MiniMax retrieveFile failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as FileResp;
  const url = json.file?.download_url ?? json.file?.backup_download_url;
  if (!url) {
    throw new Error(`MiniMax retrieveFile returned no download_url: ${JSON.stringify(json)}`);
  }
  return url;
}

/**
 * Poll a task until it succeeds, fails, or the deadline is hit. Returns the
 * final download URL.
 */
export async function waitForVideo(
  taskId: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<string> {
  const timeout = opts.timeoutMs ?? 10 * 60 * 1000;
  const interval = opts.intervalMs ?? 6_000;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const r = await queryVideoTask(taskId);
    if (r.status === "Success" && r.file_id) {
      return await retrieveFile(String(r.file_id));
    }
    if (r.status === "Fail") {
      const msg = r.base_resp?.status_msg ?? "(no message)";
      throw new Error(`MiniMax task ${taskId} failed: ${msg}`);
    }
    await new Promise((res) => setTimeout(res, interval));
  }
  throw new Error(`MiniMax task ${taskId} did not complete within ${Math.round(timeout / 1000)}s`);
}
