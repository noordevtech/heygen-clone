import type { AspectRatio } from "./types";

/**
 * Curated model catalog surfaced as dropdowns in the Studio.
 *
 * Kie.ai has two API surfaces:
 *   - "common" task API (POST /jobs/createTask, GET /jobs/recordInfo) used
 *     for marketplace models. Slugs use slash format: "bytedance/seedance-2".
 *   - dedicated namespaces (/veo3-api/*, /flux-kontext-api/*, /suno-api/*)
 *     with their own schemas.
 *
 * To keep the integration small and reliable, the catalog below only includes
 * models that work through the common task API, plus a `kind` discriminator
 * so the pipeline can pick the right client. Music goes through the dedicated
 * Suno endpoint (handled in src/lib/kie-suno.ts).
 *
 * Refs:
 *   https://docs.kie.ai/market/bytedance/seedance-2
 *   https://docs.kie.ai/market/bytedance/seedance-1-5-pro
 *   https://docs.kie.ai/market/kling/kling-3-0
 *   https://docs.kie.ai/market/kling/motion-control
 *   https://docs.kie.ai/market/google/nanobanana2
 *   https://docs.kie.ai/market/google/pro-image-to-image
 *   https://docs.kie.ai/market/flux2/pro-image-to-image
 *   https://docs.kie.ai/suno-api/quickstart
 */

export type Provider = "openrouter" | "kie";

export type VideoModelEntry = {
  id: string;
  provider: Provider;
  /** Provider-specific model identifier sent on the wire. */
  slug: string;
  label: string;
  hint: string;
  aspects: AspectRatio[];
  /** True if the model can produce native audio / lip-sync from a prompt. */
  audio?: boolean;
};

export type ImageModelEntry = {
  id: string;
  provider: Provider;
  slug: string;
  label: string;
  hint: string;
};

export type MusicModelEntry = {
  id: string;
  provider: Provider;
  /** Suno's own model token, e.g. "V5", "V4_5", "V4_5_PLUS". */
  slug: string;
  label: string;
  hint: string;
};

export const VIDEO_MODELS: VideoModelEntry[] = [
  {
    id: "openrouter:seedance",
    provider: "openrouter",
    slug: "bytedance/seedance-2.0",
    label: "Seedance 2.0 (OpenRouter)",
    hint: "Fast, stylized, strong character consistency.",
    aspects: ["9:16", "1:1", "16:9"],
  },
  {
    id: "openrouter:veo",
    provider: "openrouter",
    slug: "google/veo-3.1",
    label: "Veo 3.1 (OpenRouter)",
    hint: "Cinematic, native audio, premium.",
    aspects: ["9:16", "1:1", "16:9"],
    audio: true,
  },
  {
    id: "kie:seedance-2",
    provider: "kie",
    slug: "bytedance/seedance-2",
    label: "Seedance 2.0 (Kie.ai)",
    hint: "ByteDance reference-to-video, multimodal input.",
    aspects: ["9:16", "1:1", "16:9"],
  },
  {
    id: "kie:seedance-1-5-pro",
    provider: "kie",
    slug: "bytedance/seedance-1.5-pro",
    label: "Seedance 1.5 Pro (Kie.ai)",
    hint: "Audio + video together, multi-language lipsync.",
    aspects: ["9:16", "1:1", "16:9"],
    audio: true,
  },
  {
    id: "kie:kling-3",
    provider: "kie",
    slug: "kling-3.0/video",
    label: "Kling 3.0 (Kie.ai)",
    hint: "Latest Kling — clean motion, strong adherence.",
    aspects: ["9:16", "1:1", "16:9"],
  },
  {
    id: "kie:kling-2-6-mc",
    provider: "kie",
    slug: "kling-2.6/motion-control",
    label: "Kling 2.6 Motion Control (Kie.ai)",
    hint: "Reference-driven motion control.",
    aspects: ["9:16", "1:1", "16:9"],
  },
];

export const IMAGE_MODELS: ImageModelEntry[] = [
  {
    id: "kie:nano-banana-pro",
    provider: "kie",
    slug: "google/nano-banana-pro",
    label: "Nano Banana Pro",
    hint: "Gemini 3 Pro · highest quality.",
  },
  {
    id: "kie:nano-banana-2",
    provider: "kie",
    slug: "google/nano-banana-2",
    label: "Nano Banana 2",
    hint: "Cheaper, very fast.",
  },
  {
    id: "kie:flux2-pro",
    provider: "kie",
    slug: "flux-2/pro-image-to-image",
    label: "Flux 2 Pro",
    hint: "Photoreal, design-quality renders.",
  },
];

export const MUSIC_MODELS: MusicModelEntry[] = [
  {
    id: "kie:suno-v5",
    provider: "kie",
    slug: "V5",
    label: "Suno V5",
    hint: "Latest Suno — best quality, faster generation.",
  },
  {
    id: "kie:suno-v4-5-plus",
    provider: "kie",
    slug: "V4_5PLUS",
    label: "Suno V4.5 Plus",
    hint: "Richer arrangement, up to ~8 min.",
  },
  {
    id: "kie:suno-v4-5",
    provider: "kie",
    slug: "V4_5",
    label: "Suno V4.5",
    hint: "Solid all-rounder, smarter prompts.",
  },
  {
    id: "kie:suno-v4",
    provider: "kie",
    slug: "V4",
    label: "Suno V4",
    hint: "Cheaper, up to ~4 min.",
  },
  {
    id: "kie:suno-v3-5",
    provider: "kie",
    slug: "V3_5",
    label: "Suno V3.5",
    hint: "Cheapest baseline.",
  },
];

export function findVideoModel(id: string): VideoModelEntry | undefined {
  return VIDEO_MODELS.find((m) => m.id === id);
}
export function findImageModel(id: string): ImageModelEntry | undefined {
  return IMAGE_MODELS.find((m) => m.id === id);
}
export function findMusicModel(id: string): MusicModelEntry | undefined {
  return MUSIC_MODELS.find((m) => m.id === id);
}
