import type { AspectRatio } from "./types";

/**
 * Curated model catalog surfaced as dropdowns in the Studio.
 *
 * Each entry has:
 *   - id: stable internal id used in the request payload
 *   - provider: the integration that handles it
 *   - slug: the model identifier sent to the provider
 *   - label/hint: shown in the UI
 *   - aspects: aspect ratios this model can render (videos only)
 *
 * Slugs reflect the names Kie.ai uses publicly. If a slug is wrong for your
 * Kie.ai account, override it in /settings (default video/image/music model)
 * or open `src/lib/catalog.ts` and edit it.
 */

export type Provider = "openrouter" | "kie";

export type VideoModelEntry = {
  id: string;
  provider: Provider;
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
    id: "kie:veo3-1",
    provider: "kie",
    slug: "veo3.1",
    label: "Veo 3.1 (Kie.ai)",
    hint: "Premium cinematic + synchronized audio.",
    aspects: ["9:16", "1:1", "16:9"],
    audio: true,
  },
  {
    id: "kie:veo3-1-fast",
    provider: "kie",
    slug: "veo3.1-fast",
    label: "Veo 3.1 Fast (Kie.ai)",
    hint: "Faster, lower-cost Veo render.",
    aspects: ["9:16", "1:1", "16:9"],
    audio: true,
  },
  {
    id: "kie:runway",
    provider: "kie",
    slug: "runway-gen3",
    label: "Runway (Kie.ai)",
    hint: "Strong style transfer & motion.",
    aspects: ["9:16", "1:1", "16:9"],
  },
  {
    id: "kie:kling-2-6",
    provider: "kie",
    slug: "kling2.6",
    label: "Kling 2.6 (Kie.ai)",
    hint: "Smooth motion, good prompt adherence.",
    aspects: ["9:16", "1:1", "16:9"],
  },
  {
    id: "kie:seedance-2",
    provider: "kie",
    slug: "seedance-2.0",
    label: "Seedance 2.0 (Kie.ai)",
    hint: "ByteDance reference-to-video.",
    aspects: ["9:16", "1:1", "16:9"],
  },
];

export const IMAGE_MODELS: ImageModelEntry[] = [
  {
    id: "kie:flux-kontext",
    provider: "kie",
    slug: "flux-kontext",
    label: "Flux.1 Kontext",
    hint: "Photoreal, strong prompt adherence.",
  },
  {
    id: "kie:nano-banana",
    provider: "kie",
    slug: "nano-banana",
    label: "Nano Banana",
    hint: "Cheap, very fast.",
  },
  {
    id: "kie:gpt-4o-image",
    provider: "kie",
    slug: "gpt-4o-image",
    label: "4o Image",
    hint: "Stylized, cohesive series.",
  },
  {
    id: "kie:midjourney",
    provider: "kie",
    slug: "midjourney",
    label: "Midjourney",
    hint: "Painterly, design-quality renders.",
  },
];

export const MUSIC_MODELS: MusicModelEntry[] = [
  {
    id: "kie:suno-v5",
    provider: "kie",
    slug: "suno-v5",
    label: "Suno V5",
    hint: "Latest Suno — best quality, lyrics or instrumental.",
  },
  {
    id: "kie:suno-v4-5-plus",
    provider: "kie",
    slug: "suno-v4.5-plus",
    label: "Suno V4.5 Plus",
    hint: "Detailed arrangements, longer clips.",
  },
  {
    id: "kie:suno-v4-5",
    provider: "kie",
    slug: "suno-v4.5",
    label: "Suno V4.5",
    hint: "Solid all-rounder.",
  },
  {
    id: "kie:suno-v4",
    provider: "kie",
    slug: "suno-v4",
    label: "Suno V4",
    hint: "Cheaper, lower fidelity.",
  },
  {
    id: "kie:suno-v3-5",
    provider: "kie",
    slug: "suno-v3.5",
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
