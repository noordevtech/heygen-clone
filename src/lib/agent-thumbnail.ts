import { env } from "./env";
import { resolved } from "./settings";
import { uploadBuffer } from "./r2";

/**
 * Thumbnail generation via OpenRouter's image-generation surface.
 *
 * OpenRouter exposes image generation through the standard
 * /api/v1/chat/completions endpoint with `modalities: ["image", "text"]` —
 * NOT a dedicated /v1/images route. The model returns the generated image
 * either as a base64 data URL or an https URL in the assistant message.
 *
 * Note: OpenRouter does NOT proxy DALL-E 3. Their image surface is currently
 * Gemini Image (Nano Banana / Nano Banana 2) and FLUX. Default is
 * google/gemini-2.5-flash-image-preview which produces excellent YouTube
 * thumbnails. Swap in /settings → "OpenRouter thumbnail model" to try
 * google/gemini-3.1-flash-image-preview (Nano Banana 2) or
 * black-forest-labs/flux-2-max (highest-quality FLUX).
 */

type ChatImage = {
  type?: string;
  image_url?: { url?: string } | string;
  url?: string;
  source?: { data?: string; media_type?: string };
  b64_json?: string;
};

async function authHeaders(): Promise<Record<string, string>> {
  return {
    "content-type": "application/json",
    accept: "application/json",
    authorization: `Bearer ${await resolved.openrouterApiKey()}`,
    "http-referer": env.openrouter.referer,
    "x-title": env.openrouter.appName,
  };
}

/**
 * Walk the response payload for a string that looks like an image (data URL
 * or https URL). Returns the first hit because OpenRouter's image-response
 * shape varies per model and version — being permissive avoids breaking
 * on minor schema changes.
 */
function findImageString(payload: unknown): string | null {
  const seen = new Set<unknown>();
  const stack: unknown[] = [payload];
  const URL_REGEX = /https?:\/\/[^\s"'<>)]+\.(?:png|jpe?g|webp|gif)(?:\?[^\s"'<>)]*)?/i;
  while (stack.length) {
    const cur = stack.pop();
    if (cur == null || seen.has(cur)) continue;
    seen.add(cur);
    if (typeof cur === "string") {
      if (cur.startsWith("data:image/")) return cur;
      const m = cur.match(URL_REGEX);
      if (m) return m[0];
      continue;
    }
    if (Array.isArray(cur)) {
      for (const v of cur) stack.push(v);
      continue;
    }
    if (typeof cur === "object") {
      for (const v of Object.values(cur as Record<string, unknown>)) stack.push(v);
    }
  }
  return null;
}

async function stringToImageBuffer(
  s: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  if (s.startsWith("data:")) {
    // data:image/png;base64,iVBORw0K...
    const m = s.match(/^data:(image\/[a-zA-Z0-9+\-.]+);base64,(.+)$/);
    if (!m) throw new Error(`Malformed data URL: ${s.slice(0, 80)}…`);
    return { buffer: Buffer.from(m[2], "base64"), contentType: m[1] };
  }
  // https URL — download
  const res = await fetch(s);
  if (!res.ok) throw new Error(`Thumbnail download failed: ${res.status} for ${s}`);
  const contentType = res.headers.get("content-type") ?? "image/png";
  return { buffer: Buffer.from(await res.arrayBuffer()), contentType };
}

export type ThumbnailOptions = {
  prompt: string;
  /** Aspect ratio hint passed via image_config. Default 16:9 for YouTube. */
  aspect?: "16:9" | "1:1" | "9:16";
};

const ASPECT_DEFAULT = "16:9";

export async function generateAgentThumbnail(
  opts: ThumbnailOptions,
): Promise<{ url: string; key: string; raw: ChatImage[] }> {
  const model = await resolved.openrouterThumbnailModel();
  const aspect = opts.aspect ?? ASPECT_DEFAULT;

  // The prompt nudges the model toward thumbnail-friendly composition.
  const decoratedPrompt = [
    opts.prompt.trim(),
    "",
    "Style: YouTube thumbnail. Bold, high-contrast composition with a clear focal point.",
    "Leave roughly the left or right third uncluttered so a title overlay can sit on top without obscuring the subject.",
    "No text or typography embedded in the image — overlays will be added separately.",
    `Aspect ratio: ${aspect}.`,
  ].join("\n");

  const body = {
    model,
    modalities: ["image", "text"],
    image_config: { aspect_ratio: aspect },
    messages: [{ role: "user", content: decoratedPrompt }],
  };

  const res = await fetch(`${env.openrouter.baseUrl}/chat/completions`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `OpenRouter thumbnail HTTP ${res.status} (model=${model}): ${text.slice(0, 400)}`,
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`OpenRouter thumbnail non-JSON response: ${text.slice(0, 400)}`);
  }

  const imageStr = findImageString(json);
  if (!imageStr) {
    throw new Error(
      `OpenRouter returned no image (model=${model}). First 500 chars: ${text.slice(0, 500)}`,
    );
  }

  const { buffer, contentType } = await stringToImageBuffer(imageStr);

  // Pick a sensible file extension from the content type.
  const ext = contentType.includes("png")
    ? "png"
    : contentType.includes("webp")
      ? "webp"
      : contentType.includes("gif")
        ? "gif"
        : "jpg";
  const key = `thumbnails/agent-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;
  const up = await uploadBuffer(key, buffer, contentType);
  return { url: up.url, key, raw: [] };
}
