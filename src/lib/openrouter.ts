import { env } from "./env";
import type { AspectRatio, VideoModel } from "./types";

/**
 * Thin wrapper around OpenRouter for video-generation models (Seedance, Veo).
 *
 * OpenRouter exposes most providers behind an OpenAI-compatible
 * /chat/completions endpoint. For video models, the assistant typically
 * responds with a hosted URL (or base64) for the generated clip — we extract
 * the first http(s) URL we find. If your provider returns a different shape,
 * adjust `extractVideoUrl` accordingly.
 */

function modelSlug(model: VideoModel): string {
  return model === "veo" ? env.openrouter.veoModel : env.openrouter.seedanceModel;
}

function headers(): Record<string, string> {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${env.openrouter.apiKey()}`,
    "http-referer": env.openrouter.referer,
    "x-title": env.openrouter.appName,
  };
}

export type GenerateClipOptions = {
  model: VideoModel;
  prompt: string;
  aspect: AspectRatio;
  durationSec?: number;
  /** Optional reference image / first frame (data URL or https URL). */
  referenceImage?: string;
  /** Optional audio track URL to drive lip-sync (Veo supports this natively). */
  audioUrl?: string;
};

export type GenerateClipResult = {
  videoUrl: string;
  raw: unknown;
};

const URL_REGEX = /https?:\/\/[^\s"'<>)]+\.(?:mp4|mov|webm|m4v)(?:\?[^\s"'<>)]*)?/i;

function extractVideoUrl(payload: unknown): string | null {
  const seen = new Set<unknown>();
  const stack: unknown[] = [payload];
  while (stack.length) {
    const cur = stack.pop();
    if (cur == null || seen.has(cur)) continue;
    seen.add(cur);
    if (typeof cur === "string") {
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

export async function generateClip(opts: GenerateClipOptions): Promise<GenerateClipResult> {
  const slug = modelSlug(opts.model);
  const userParts: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: [
        opts.prompt,
        `Aspect ratio: ${opts.aspect}.`,
        opts.durationSec ? `Duration: ${opts.durationSec}s.` : "",
        opts.audioUrl ? `Sync the speaker's lips to the provided audio.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    },
  ];
  if (opts.referenceImage) {
    userParts.push({ type: "image_url", image_url: { url: opts.referenceImage } });
  }
  if (opts.audioUrl) {
    // Some providers accept an explicit audio reference; we include it as a
    // hint via a text part as well to be safe.
    userParts.push({ type: "input_audio", input_audio: { url: opts.audioUrl } });
  }

  const body = {
    model: slug,
    modalities: ["video"],
    extra_body: {
      video: {
        aspect_ratio: opts.aspect,
        duration_seconds: opts.durationSec ?? 6,
      },
    },
    messages: [
      {
        role: "system",
        content:
          "You generate short cinematic clips suited for social-media reels. Match the requested aspect ratio. Return the video URL.",
      },
      { role: "user", content: userParts },
    ],
  };

  const res = await fetch(`${env.openrouter.baseUrl}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter ${slug} failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as unknown;
  const url = extractVideoUrl(json);
  if (!url) {
    throw new Error(
      `OpenRouter ${slug} returned no video URL. Adjust extractVideoUrl() for this provider's response shape. Raw: ${JSON.stringify(json).slice(0, 500)}`,
    );
  }
  return { videoUrl: url, raw: json };
}
