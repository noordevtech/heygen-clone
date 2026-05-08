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
  {
    id: "kie:flux2-klein",
    provider: "kie",
    slug: "flux-2/klein",
    label: "Flux 2 Klein (unverified)",
    hint: "Black Forest Labs FLUX.2 [klein]. Slug guess: flux-2/klein — Kie may use a different name. If you get \"model not supported\", paste the real slug into Custom Kie slug below.",
  },
  {
    id: "kie:z-image-turbo",
    provider: "kie",
    slug: "z-image",
    label: "Z-Image",
    hint: "Tongyi Z-Image (docs.kie.ai/market/z-image/z-image). Inputs use snake_case (aspect_ratio, nsfw_checker).",
  },
  {
    id: "kie:qwen-image",
    provider: "kie",
    slug: "qwen/image",
    label: "Qwen Image (unverified)",
    hint: "Alibaba Qwen-Image. Slug guess: qwen/image — paste the real slug from your Kie dashboard if this 422s.",
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

export type StylePreset = {
  id: string;
  label: string;
  /** Short tagline shown under the tile. */
  hint: string;
  /** Suffix appended to the user's image / video prompt. */
  prompt: string;
  /** Two CSS color stops used to render a tile thumbnail when no preview asset
   *  exists. Keeps the picker visually distinct without bundling images. */
  swatch: [string, string];
};

/**
 * Curated style presets shown as a tile grid in the Studio and YouTube pages.
 * Selecting a style appends its `prompt` suffix to whatever visual prompt the
 * pipeline is about to send to the image / video model.
 *
 * Order matches the design mock — "None" first, then alphabetical.
 */
export const STYLE_PRESETS: StylePreset[] = [
  { id: "none", label: "None", hint: "Use the raw prompt", prompt: "", swatch: ["#f3f4f6", "#d1d5db"] },
  { id: "3d-model", label: "3D model", hint: "Stylized 3D render", prompt: ", stylized 3D model render, octane render, soft studio lighting, subsurface scattering, vivid colors", swatch: ["#fde68a", "#f59e0b"] },
  { id: "70s-doc", label: "70s Documentary", hint: "16mm grain, warm tones", prompt: ", 1970s documentary film aesthetic, 16mm film grain, faded warm tones, vintage color science, slight halation", swatch: ["#fcd34d", "#92400e"] },
  { id: "anime", label: "Anime", hint: "Cel-shaded anime", prompt: ", cel-shaded anime illustration, clean line work, vibrant flat colors, expressive eyes, studio anime quality", swatch: ["#fbcfe8", "#db2777"] },
  { id: "biblical", label: "Biblical", hint: "Renaissance fresco", prompt: ", biblical fresco painting, dramatic chiaroscuro, golden halos, robed figures, oil-on-canvas texture", swatch: ["#fef3c7", "#a16207"] },
  { id: "brush-ink", label: "Brush ink", hint: "Sumi-e wash", prompt: ", sumi-e ink wash painting, expressive black brush strokes on rice paper, minimalist negative space", swatch: ["#e5e7eb", "#111827"] },
  { id: "chalkboard", label: "Chalkboard", hint: "Hand-drawn chalk", prompt: ", chalkboard drawing in white and pastel chalks on a black slate, hand-sketched lines, smudged textures", swatch: ["#1f2937", "#d1d5db"] },
  { id: "charcoal", label: "Charcoal", hint: "Charcoal sketch", prompt: ", charcoal sketch on textured paper, smudged shadows, expressive strokes, monochrome", swatch: ["#9ca3af", "#1f2937"] },
  { id: "cinematic", label: "Cinematic", hint: "Anamorphic film look", prompt: ", cinematic photography, anamorphic lens, shallow depth of field, dramatic lighting, teal and orange color grade, film grain", swatch: ["#1e3a8a", "#f97316"] },
  { id: "clay", label: "Clay", hint: "Plasticine claymation", prompt: ", claymation, plasticine sculpted figures, tactile thumbprints, soft studio lighting, stop-motion aesthetic", swatch: ["#fcd34d", "#b45309"] },
  { id: "comic-book", label: "Comic book", hint: "Inked comic panels", prompt: ", classic comic book illustration, bold inked outlines, halftone dot shading, saturated primary colors", swatch: ["#fde68a", "#dc2626"] },
  { id: "crayon", label: "Crayon", hint: "Wax crayon doodle", prompt: ", wax crayon drawing, childlike strokes, paper texture, vibrant scribbled colors", swatch: ["#fbbf24", "#7c3aed"] },
  { id: "fantasy-art", label: "Fantasy art", hint: "Mythic concept art", prompt: ", high fantasy concept art, ethereal lighting, mythic atmosphere, painted detail, magical realism", swatch: ["#a78bfa", "#1e1b4b"] },
  { id: "film-noir", label: "Film noir", hint: "B&W high contrast", prompt: ", film noir, black-and-white, harsh chiaroscuro, venetian-blind shadows, smoky atmosphere, 1940s detective movie", swatch: ["#111827", "#9ca3af"] },
  { id: "golden-age", label: "Golden age", hint: "Vintage Hollywood", prompt: ", golden age of Hollywood portraiture, soft glamour lighting, sepia tones, vintage film stock", swatch: ["#fde68a", "#a16207"] },
  { id: "golden-hour", label: "Golden hour", hint: "Warm sunlit", prompt: ", golden hour photography, warm sunlit rim light, lens flares, dreamy atmosphere", swatch: ["#fcd34d", "#f97316"] },
  { id: "illustration", label: "Illustration", hint: "Editorial illustration", prompt: ", modern editorial illustration, clean shapes, flat textured colors, designed composition", swatch: ["#fda4af", "#7c3aed"] },
  { id: "layered-papercut", label: "Layered papercut", hint: "Stacked paper craft", prompt: ", layered papercut diorama, cut-paper depth, soft shadows between paper layers, craft-paper texture", swatch: ["#fed7aa", "#0ea5e9"] },
  { id: "lego", label: "Lego", hint: "Brick-built scene", prompt: ", scene built entirely out of Lego bricks, plastic studs, bright primary colors, macro photography", swatch: ["#facc15", "#dc2626"] },
  { id: "line-art", label: "Line art", hint: "Single-weight outline", prompt: ", clean line art, single-weight black outlines on white, minimal shading", swatch: ["#f3f4f6", "#111827"] },
  { id: "neon-noir", label: "Neon noir", hint: "Cyberpunk neon", prompt: ", neon noir cyberpunk aesthetic, magenta and cyan neon signs, rain-slick streets, dramatic shadows", swatch: ["#ec4899", "#06b6d4"] },
  { id: "paper-cutout", label: "Paper cutout", hint: "Flat collage", prompt: ", flat paper cut-out collage, simple shapes, hand-cut edges, textured construction paper", swatch: ["#fde68a", "#10b981"] },
  { id: "pencil-sketch", label: "Pencil sketch", hint: "Graphite study", prompt: ", graphite pencil sketch, fine cross-hatching, sketchbook paper, monochrome study", swatch: ["#e5e7eb", "#374151"] },
  { id: "realistic", label: "Realistic", hint: "DSLR photo", prompt: ", photorealistic DSLR photograph, natural lighting, true-to-life detail, sharp focus, high dynamic range", swatch: ["#cbd5e1", "#1f2937"] },
  { id: "renaissance", label: "Renaissance", hint: "Oil painting", prompt: ", Renaissance oil painting, soft sfumato, warm earth tones, classical composition, museum quality", swatch: ["#fde68a", "#7c2d12"] },
  { id: "technical-illustration", label: "Technical illustration", hint: "Schematic linework", prompt: ", precise technical illustration, schematic linework, exploded views, blueprint annotations, clean vector style", swatch: ["#bfdbfe", "#1e40af"] },
  { id: "tiny-world", label: "Tiny world", hint: "Tilt-shift miniature", prompt: ", tilt-shift miniature photography, tiny-world illusion, exaggerated saturation, shallow plane of focus", swatch: ["#86efac", "#15803d"] },
  { id: "watercolor", label: "Watercolor", hint: "Soft watercolor", prompt: ", soft watercolor painting, bleeding pigments, paper texture, light-handed brushwork", swatch: ["#bae6fd", "#a78bfa"] },
  { id: "whimsical", label: "Whimsical", hint: "Storybook charm", prompt: ", whimsical storybook illustration, soft pastels, hand-drawn charm, dreamy storybook atmosphere", swatch: ["#fbcfe8", "#fcd34d"] },
];

export function findStylePreset(id: string | undefined | null): StylePreset | undefined {
  if (!id) return undefined;
  return STYLE_PRESETS.find((s) => s.id === id);
}

/** Append a style preset's prompt suffix to the user's prompt. Returns the
 *  prompt unchanged if the style is unknown or "none". */
export function applyStyle(prompt: string, styleId: string | undefined | null): string {
  const style = findStylePreset(styleId);
  if (!style || !style.prompt) return prompt;
  return `${prompt}${style.prompt}`;
}

export function findVideoModel(id: string): VideoModelEntry | undefined {
  return VIDEO_MODELS.find((m) => m.id === id);
}
export function findImageModel(id: string): ImageModelEntry | undefined {
  return IMAGE_MODELS.find((m) => m.id === id);
}
export function findMusicModel(id: string): MusicModelEntry | undefined {
  return MUSIC_MODELS.find((m) => m.id === id);
}
