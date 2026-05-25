import { resolved } from "./settings";
import { uploadBuffer } from "./r2";

/**
 * Direct OpenAI image generation via /v1/images/generations.
 *
 * Used as a Plan-B for the Agent's thumbnail step when the user explicitly
 * wants DALL-E 3 (OpenRouter doesn't proxy DALL-E 3 today). All other
 * thumbnail rendering goes through OpenRouter's image-modality surface in
 * src/lib/agent-thumbnail.ts.
 *
 * Reference: https://platform.openai.com/docs/api-reference/images/create
 */

const BASE = "https://api.openai.com/v1";

/**
 * DALL-E 3 only supports three sizes; map our aspect-ratio enum to the
 * closest available. 16:9 → 1792x1024, 1:1 → 1024x1024, 9:16 → 1024x1792.
 */
const SIZE_FOR_ASPECT: Record<"16:9" | "1:1" | "9:16", string> = {
  "16:9": "1792x1024",
  "1:1": "1024x1024",
  "9:16": "1024x1792",
};

export type DalleOptions = {
  prompt: string;
  aspect?: "16:9" | "1:1" | "9:16";
  /** "hd" gives more detail (and costs ~2x). Default "hd" for thumbnails. */
  quality?: "standard" | "hd";
};

type DalleResponse = {
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

  // NOTE: We deliberately omit `style` even though the DALL-E 3 docs still
  // list it. OpenAI is migrating image traffic to gpt-image-1 under the
  // hood, and gpt-image-1 rejects unknown params (400: "Unknown parameter:
  // 'style'"). The vividness we want is implicit in the prompt anyway.
  const body = {
    model: "dall-e-3",
    prompt: opts.prompt,
    n: 1,
    size,
    quality: opts.quality ?? "hd",
    response_format: "url",
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
    throw new Error(`OpenAI DALL-E 3 HTTP ${res.status}: ${text.slice(0, 400)}`);
  }
  let json: DalleResponse;
  try {
    json = JSON.parse(text) as DalleResponse;
  } catch {
    throw new Error(`OpenAI DALL-E 3 non-JSON response: ${text.slice(0, 400)}`);
  }
  if (json.error) {
    throw new Error(`OpenAI DALL-E 3 error: ${json.error.message ?? JSON.stringify(json.error)}`);
  }
  const first = json.data?.[0];
  if (!first?.url) {
    throw new Error(`OpenAI DALL-E 3 returned no image URL: ${text.slice(0, 400)}`);
  }

  // Mirror to R2 immediately — OpenAI URLs expire in ~1 hour.
  const downloadRes = await fetch(first.url);
  if (!downloadRes.ok) {
    throw new Error(
      `Failed to download DALL-E result (HTTP ${downloadRes.status}) from ${first.url}`,
    );
  }
  const buf = Buffer.from(await downloadRes.arrayBuffer());
  const contentType = downloadRes.headers.get("content-type") ?? "image/png";
  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : "jpg";
  const key = `thumbnails/dalle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const up = await uploadBuffer(key, buf, contentType);
  return { url: up.url, revisedPrompt: first.revised_prompt };
}
