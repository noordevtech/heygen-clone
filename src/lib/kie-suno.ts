import { resolved } from "./settings";

/**
 * Kie.ai Suno music generation. Uses a dedicated endpoint (NOT the common
 * /jobs/createTask), with its own request/response schema.
 *
 *   POST /api/v1/generate                       -> { code, data: { taskId } }
 *   GET  /api/v1/generate/record-info?taskId=…  -> { code, data: { ... } }
 *
 * Reference: https://docs.kie.ai/suno-api/quickstart
 */

const BASE = "https://api.kie.ai/api/v1";

async function authHeaders(): Promise<Record<string, string>> {
  return {
    "content-type": "application/json",
    accept: "application/json",
    authorization: `Bearer ${await resolved.kieApiKey()}`,
  };
}

export type SunoCreateOptions = {
  /** Suno model token: "V3_5" | "V4" | "V4_5" | "V4_5PLUS" | "V5". */
  model: string;
  prompt: string;
  /** True for instrumental-only (no lyrics). */
  instrumental?: boolean;
  /** Genre/mood description, e.g. "lofi, warm pads". */
  style?: string;
  title?: string;
  callBackUrl?: string;
};

type CreateResp = { code: number; msg?: string; data?: { taskId: string } };

export async function createSunoTask(opts: SunoCreateOptions): Promise<string> {
  // Suno has two modes:
  //   customMode: false → simple "describe what you want" via `prompt`. Other
  //     fields ignored; Suno picks a style/title.
  //   customMode: true  → `style` + `title` REQUIRED. `prompt` becomes the
  //     lyrics (ignored if instrumental=true).
  // We use custom mode whenever the caller provides a style or title,
  // synthesizing whichever isn't supplied so we always satisfy the schema.
  const customMode = !!(opts.style || opts.title);
  const body: Record<string, unknown> = {
    model: opts.model,
    customMode,
    instrumental: opts.instrumental ?? true,
    prompt: opts.prompt,
  };
  if (customMode) {
    body.style = opts.style ?? "cinematic ambient instrumental";
    body.title = opts.title ?? "Background score";
  }
  if (opts.callBackUrl) body.callBackUrl = opts.callBackUrl;

  const res = await fetch(`${BASE}/generate`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Suno createTask HTTP ${res.status} (model=${opts.model}): ${text.slice(0, 400)}`,
    );
  }
  let json: CreateResp;
  try {
    json = JSON.parse(text) as CreateResp;
  } catch {
    throw new Error(`Suno createTask non-JSON response: ${text.slice(0, 400)}`);
  }
  if (json.code !== 200 || !json.data?.taskId) {
    throw new Error(
      `Suno createTask code=${json.code} (model=${opts.model}): ${json.msg ?? text.slice(0, 400)}`,
    );
  }
  return json.data.taskId;
}

type SunoTrack = { audioUrl?: string; streamAudioUrl?: string; sourceAudioUrl?: string; duration?: number };
type RecordInfo = {
  code: number;
  msg?: string;
  data?: {
    taskId: string;
    status?: string;
    response?: { sunoData?: SunoTrack[] };
    errorCode?: string;
    errorMessage?: string;
  };
};

export type WaitOptions = {
  timeoutMs?: number;
  intervalMs?: number;
};

export async function waitForSuno(
  taskId: string,
  opts: WaitOptions = {},
): Promise<{ urls: string[]; record: RecordInfo }> {
  const timeout = opts.timeoutMs ?? 8 * 60 * 1000;
  const interval = opts.intervalMs ?? 8_000;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const res = await fetch(
      `${BASE}/generate/record-info?taskId=${encodeURIComponent(taskId)}`,
      { headers: await authHeaders(), cache: "no-store" },
    );
    if (!res.ok) throw new Error(`Suno recordInfo failed: ${res.status} ${await res.text()}`);
    const record = (await res.json()) as RecordInfo;
    const status = record.data?.status?.toUpperCase();
    if (status === "SUCCESS" || status === "COMPLETE") {
      const tracks = record.data?.response?.sunoData ?? [];
      const urls = tracks
        .map((t) => t.audioUrl ?? t.sourceAudioUrl ?? t.streamAudioUrl)
        .filter((u): u is string => !!u);
      if (urls.length === 0) {
        throw new Error(`Suno task ${taskId} completed but contained no audio URLs.`);
      }
      return { urls, record };
    }
    if (status?.startsWith("FAIL") || status === "ERROR" || status === "CANCELED") {
      const msg = record.data?.errorMessage ?? record.msg ?? "(no error message)";
      throw new Error(`Suno task ${status}: ${msg}`);
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`Suno task did not complete within ${Math.round(timeout / 1000)}s`);
}
