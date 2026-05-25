import { resolved } from "./settings";
import { uploadBuffer } from "./r2";

/**
 * Direct OpenAI image generation via /v1/images/generations.
 *
 * OpenAI has retired dall-e-3 on most accounts and migrated image traffic
 * to **gpt-image-1** (the GPT-4o native image model). gpt-image-1 has a
 * different parameter shape than DALL-E 3:
 *   - sizes are 1024x1024 | 1536x1024 | 1024x1536 (no 1792x1024)
 *   - quality is low|medium|high|auto (no "standard"/"hd")
 *   - response is always base64 in data[0].b64_json (no `url`,
 *     no `response_format` param)
 *   - `style` parameter is gone
 *
 * Reference: https://platform.openai.com/docs/api-reference/images/create
 */

const BASE = "https://api.openai.com/v1";

/**
 * gpt-image-1 supports three concrete sizes. 16:9 is approximated by
 * 1536x1024 (closer to 3:2) — the API doesn't offer true 16:9. The
 * resulting image is still wide enough to use as a YouTube thumbnail
 * after letterbox-cropping if you want exactly 16:9.
 */
const SIZE_FOR_ASPECT: Record<"16:9" | "1:1" | "9:16", string> = {
  "16:9": "1536x1024",
  "1:1": "1024x1024",
  "9:16": "1024x1536",
};

export type DalleOptions = {
  prompt: string;
  aspect?: "16:9" | "1:1" | "9:16";
  /**
   * gpt-image-1 uses low|medium|high|auto.
   * Default "high" — thumbnails are the use case where the extra detail
   * matters and the per-image cost difference is small.
   */
  quality?: "low" | "medium" | "high" | "auto";
};

type ImageGenResponse = {
  created: number;
  data?: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
  error?: { message?: string; type?: string };
};

export async function generateDalleThumbnail(
  opts: DalleOptions,
): Promise<{ url: string; revisedPrompt?: string }> {
  const apiKey = await resolved.openaiApiKey();
  const aspect = opts.aspect ?? "16:9";
  const size = SIZE_FOR_ASPECT[aspect];

  // gpt-image-1 minimal body. No `style`, no `response_format` — those
  // params were dall-e-3 only and gpt-image-1 rejects unknown fields with
  // 400. Response is always base64 in data[0].b64_json.
  const body = {
    model: "gpt-image-1",
    prompt: opts.prompt,
    n: 1,
    size,
    quality: opts.quality ?? "high",
  };

  const res = await fetch(`${BASE}/images/generations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`OpenAI image HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  let json: ImageGenResponse;
  try {
    json = JSON.parse(text) as ImageGenResponse;
  } catch {
    throw new Error(`OpenAI image non-JSON response: ${text.slice(0, 400)}`);
  }
  if (json.error) {
    throw new Error(`OpenAI image error: ${json.error.message ?? JSON.stringify(json.error)}`);
  }
  const first = json.data?.[0];
  if (!first || (!first.url && !first.b64_json)) {
    throw new Error(
      `OpenAI returned no image (no url and no b64_json): ${text.slice(0, 400)}`,
    );
  }

  // gpt-image-1 returns base64; older dall-e-2/3 returns a 1-hour URL.
  // Handle both — decode b64 if present, otherwise download the URL — and
  // mirror to R2 either way so the final URL is stable.
  let buf: Buffer;
  let contentType: string;
  if (first.b64_json) {
    buf = Buffer.from(first.b64_json, "base64");
    contentType = "image/png";
  } else {
    const downloadRes = await fetch(first.url!);
    if (!downloadRes.ok) {
      throw new Error(
        `Failed to download OpenAI image (HTTP ${downloadRes.status}) from ${first.url}`,
      );
    }
    buf = Buffer.from(await downloadRes.arrayBuffer());
    contentType = downloadRes.headers.get("content-type") ?? "image/png";
  }
  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : "jpg";
  const key = `thumbnails/openai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const up = await uploadBuffer(key, buf, contentType);
  return { url: up.url, revisedPrompt: first.revised_prompt };
}
