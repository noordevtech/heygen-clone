import { resolved } from "./settings";

/**
 * Kie.ai unified job API client.
 *
 *   POST https://api.kie.ai/api/v1/jobs/createTask
 *   GET  https://api.kie.ai/api/v1/jobs/recordInfo?taskId=...
 *
 * One endpoint covers video, image, and music — the request body just changes
 * the `model` slug and `input` payload.
 *
 * Reference: https://docs.kie.ai
 */

const BASE = "https://api.kie.ai/api/v1";

async function authHeaders(): Promise<Record<string, string>> {
  return {
    "content-type": "application/json",
    accept: "application/json",
    authorization: `Bearer ${await resolved.kieApiKey()}`,
  };
}

export type CreateTaskOptions = {
  model: string;
  input: Record<string, unknown>;
  /** Provider-side webhook on completion. */
  callBackUrl?: string;
};

export type CreateTaskResponse = {
  code: number;
  msg?: string;
  data?: {
    taskId: string;
  };
};

export type TaskState = "queuing" | "processing" | "success" | "fail" | "canceled" | string;

export type TaskRecord = {
  code: number;
  msg?: string;
  data?: {
    taskId: string;
    model?: string;
    state?: TaskState;
    /** Returned on success — varies by model, normalized below. */
    resultJson?: string | Record<string, unknown>;
    failCode?: string;
    failMsg?: string;
    [key: string]: unknown;
  };
};

export async function createTask(opts: CreateTaskOptions): Promise<string> {
  const res = await fetch(`${BASE}/jobs/createTask`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      model: opts.model,
      input: opts.input,
      ...(opts.callBackUrl ? { callBackUrl: opts.callBackUrl } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`Kie.ai createTask (${opts.model}) failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as CreateTaskResponse;
  if (json.code !== 200 || !json.data?.taskId) {
    throw new Error(`Kie.ai createTask returned ${json.code}: ${json.msg ?? JSON.stringify(json)}`);
  }
  return json.data.taskId;
}

export async function getTask(taskId: string): Promise<TaskRecord> {
  const res = await fetch(`${BASE}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Kie.ai recordInfo failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as TaskRecord;
}

export type WaitOptions = {
  /** Total wait budget in ms. Default: 8 minutes. */
  timeoutMs?: number;
  /** Poll cadence in ms. Default: 6s. */
  intervalMs?: number;
};

const URL_REGEX = /https?:\/\/[^\s"'<>)]+/g;

/**
 * Walk a Kie.ai task result and pluck out URLs by file extension. Different
 * model categories return URLs under different keys (`videoUrl`, `imageUrls`,
 * `audioUrls`, etc.) so a generic walker is more robust.
 */
export function extractUrls(record: TaskRecord, kinds: ("video" | "image" | "audio")[]): string[] {
  const haystack: string[] = [];

  function walk(v: unknown) {
    if (v == null) return;
    if (typeof v === "string") {
      // Result can come back as a JSON-encoded string.
      if (v.startsWith("{") || v.startsWith("[")) {
        try {
          walk(JSON.parse(v));
          return;
        } catch {
          /* fall through to URL match */
        }
      }
      const matches = v.match(URL_REGEX);
      if (matches) haystack.push(...matches);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) walk(item);
      return;
    }
    if (typeof v === "object") {
      for (const item of Object.values(v as Record<string, unknown>)) walk(item);
    }
  }
  walk(record.data);

  const exts = {
    video: /\.(mp4|mov|webm|m4v)(\?|#|$)/i,
    image: /\.(png|jpe?g|webp|gif)(\?|#|$)/i,
    audio: /\.(mp3|wav|m4a|ogg|flac)(\?|#|$)/i,
  };
  const wanted = kinds.flatMap((k) => [exts[k]]);
  return [...new Set(haystack)].filter((u) => wanted.some((re) => re.test(u)));
}

export async function waitForTask(
  taskId: string,
  kinds: ("video" | "image" | "audio")[],
  opts: WaitOptions = {},
): Promise<{ urls: string[]; record: TaskRecord }> {
  const timeout = opts.timeoutMs ?? 8 * 60 * 1000;
  const interval = opts.intervalMs ?? 6_000;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const record = await getTask(taskId);
    const state = record.data?.state;
    if (state === "success") {
      const urls = extractUrls(record, kinds);
      if (urls.length === 0) {
        throw new Error(
          `Kie.ai task ${taskId} succeeded but no ${kinds.join("/")} URL was found in the response.`,
        );
      }
      return { urls, record };
    }
    if (state === "fail" || state === "canceled") {
      const msg = record.data?.failMsg ?? record.msg ?? "(no error message)";
      throw new Error(`Kie.ai task ${state}: ${msg}`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`Kie.ai task did not complete within ${Math.round(timeout / 1000)}s`);
}
