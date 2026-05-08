import { resolved } from "./settings";

/**
 * Stock-media search wrappers.
 *
 * Two providers are supported today:
 *  - Pexels  (https://www.pexels.com/api/) — photos AND videos. Free, generous
 *    quota (200 req/h, 20k req/mo). Royalty-free for commercial use.
 *  - Unsplash (https://unsplash.com/developers) — photos only. Demo tier is
 *    50 req/h; production tier is 5000 req/h. Royalty-free for commercial use;
 *    attribution + a tracked download ping is required by their API guidelines.
 *
 * Unsplash does not currently expose a public video API, so video search is
 * Pexels-only.
 */

export type StockProvider = "pexels" | "unsplash" | "ai";
export type StockKind = "image" | "video";

export type StockPhoto = {
  id: string;
  provider: StockProvider;
  width: number;
  height: number;
  /** Best quality URL we use for compositing. */
  url: string;
  /** Smaller URL for preview thumbnails in the editor. */
  thumbUrl: string;
  photographer: string;
  photographerUrl?: string;
  pageUrl: string;
  alt?: string;
  /**
   * Unsplash-only: pinging this URL tells Unsplash a download happened. Their
   * API guidelines require it before redistributing the image.
   */
  downloadLocation?: string;
};

export type StockVideo = {
  id: string;
  provider: StockProvider;
  width: number;
  height: number;
  durationSec: number;
  /** Best quality MP4 URL we use for compositing. */
  url: string;
  /** Poster/preview image URL for the editor grid. */
  thumbUrl: string;
  photographer: string;
  photographerUrl?: string;
  pageUrl: string;
};

export type SearchOptions = {
  query: string;
  page?: number;
  perPage?: number;
  /** Bias the result toward the requested aspect ratio. */
  orientation?: "landscape" | "portrait" | "square";
};

// ---------- Pexels photos ----------

const PEXELS_BASE = "https://api.pexels.com/v1";

type PexelsPhotoResponse = {
  total_results: number;
  photos: Array<{
    id: number;
    width: number;
    height: number;
    photographer: string;
    photographer_url?: string;
    url: string;
    alt?: string;
    src: {
      original: string;
      large2x: string;
      large: string;
      medium: string;
      small: string;
      portrait: string;
      landscape: string;
      tiny: string;
    };
  }>;
};

export async function searchPexels(opts: SearchOptions): Promise<StockPhoto[]> {
  const params = new URLSearchParams({
    query: opts.query,
    per_page: String(opts.perPage ?? 12),
    page: String(opts.page ?? 1),
    ...(opts.orientation ? { orientation: opts.orientation } : {}),
  });
  const res = await fetch(`${PEXELS_BASE}/search?${params.toString()}`, {
    headers: { authorization: await resolved.pexelsApiKey() },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Pexels search failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as PexelsPhotoResponse;
  return json.photos.map((p) => ({
    id: `pexels-${p.id}`,
    provider: "pexels" as const,
    width: p.width,
    height: p.height,
    url: p.src.large2x ?? p.src.original,
    thumbUrl: p.src.medium ?? p.src.small,
    photographer: p.photographer,
    photographerUrl: p.photographer_url,
    pageUrl: p.url,
    alt: p.alt,
  }));
}

// ---------- Pexels videos ----------

const PEXELS_VIDEO_BASE = "https://api.pexels.com/videos";

type PexelsVideoFile = {
  id: number;
  quality: string; // "hd" | "sd" | "uhd" | etc
  file_type: string;
  width: number | null;
  height: number | null;
  link: string;
};

type PexelsVideoResponse = {
  total_results: number;
  videos: Array<{
    id: number;
    width: number;
    height: number;
    duration: number;
    url: string;
    image: string;
    user: { name: string; url: string };
    video_files: PexelsVideoFile[];
  }>;
};

/**
 * Pick the best MP4 video file. Prefer "hd" 1080-class for our 1920x1080
 * timeline; fall back to anything mp4-ish if hd isn't there.
 */
function pickPexelsVideoFile(files: PexelsVideoFile[]): PexelsVideoFile | undefined {
  const mp4s = files.filter((f) => f.file_type === "video/mp4" && f.link);
  // Prefer files closest to (but not exceeding) 1080p height; fall back to highest available.
  const scored = mp4s
    .map((f) => ({ f, h: f.height ?? 0 }))
    .sort((a, b) => {
      const idealA = a.h <= 1080 ? 1080 - a.h : (a.h - 1080) * 2;
      const idealB = b.h <= 1080 ? 1080 - b.h : (b.h - 1080) * 2;
      return idealA - idealB;
    });
  return scored[0]?.f ?? mp4s[0];
}

export async function searchPexelsVideos(opts: SearchOptions): Promise<StockVideo[]> {
  const params = new URLSearchParams({
    query: opts.query,
    per_page: String(opts.perPage ?? 12),
    page: String(opts.page ?? 1),
    ...(opts.orientation ? { orientation: opts.orientation } : {}),
  });
  const res = await fetch(`${PEXELS_VIDEO_BASE}/search?${params.toString()}`, {
    headers: { authorization: await resolved.pexelsApiKey() },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Pexels video search failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as PexelsVideoResponse;
  const out: StockVideo[] = [];
  for (const v of json.videos) {
    const file = pickPexelsVideoFile(v.video_files);
    if (!file) continue;
    out.push({
      id: `pexels-${v.id}`,
      provider: "pexels",
      width: file.width ?? v.width,
      height: file.height ?? v.height,
      durationSec: v.duration,
      url: file.link,
      thumbUrl: v.image,
      photographer: v.user.name,
      photographerUrl: v.user.url,
      pageUrl: v.url,
    });
  }
  return out;
}

// ---------- Unsplash photos ----------

const UNSPLASH_BASE = "https://api.unsplash.com";

type UnsplashSearchResponse = {
  total: number;
  results: Array<{
    id: string;
    width: number;
    height: number;
    alt_description: string | null;
    description: string | null;
    urls: {
      raw: string;
      full: string;
      regular: string;
      small: string;
      thumb: string;
    };
    links: {
      html: string;
      download_location: string;
    };
    user: {
      name: string;
      links: { html: string };
    };
  }>;
};

function mapUnsplashOrientation(o?: SearchOptions["orientation"]) {
  // Unsplash uses: landscape | portrait | squarish
  if (o === "square") return "squarish";
  return o;
}

export async function searchUnsplash(opts: SearchOptions): Promise<StockPhoto[]> {
  const params = new URLSearchParams({
    query: opts.query,
    per_page: String(opts.perPage ?? 12),
    page: String(opts.page ?? 1),
  });
  const orientation = mapUnsplashOrientation(opts.orientation);
  if (orientation) params.set("orientation", orientation);
  const res = await fetch(`${UNSPLASH_BASE}/search/photos?${params.toString()}`, {
    headers: {
      authorization: `Client-ID ${await resolved.unsplashApiKey()}`,
      "accept-version": "v1",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Unsplash search failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as UnsplashSearchResponse;
  return json.results.map((p) => ({
    id: `unsplash-${p.id}`,
    provider: "unsplash" as const,
    width: p.width,
    height: p.height,
    url: p.urls.regular,
    thumbUrl: p.urls.small,
    photographer: p.user.name,
    photographerUrl: p.user.links.html,
    pageUrl: p.links.html,
    alt: p.alt_description ?? p.description ?? undefined,
    downloadLocation: p.links.download_location,
  }));
}

/**
 * Unsplash API guidelines require pinging /photos/:id/download before using
 * a downloaded asset. Fire-and-forget — if it fails we still proceed.
 */
export async function pingUnsplashDownload(downloadLocation: string): Promise<void> {
  try {
    await fetch(downloadLocation, {
      headers: { authorization: `Client-ID ${await resolved.unsplashApiKey()}` },
      cache: "no-store",
    });
  } catch {
    /* ignore */
  }
}

// ---------- Unified entry ----------

export async function searchStockPhotos(
  provider: StockProvider,
  opts: SearchOptions,
): Promise<StockPhoto[]> {
  if (provider === "unsplash") return searchUnsplash(opts);
  return searchPexels(opts);
}

export async function searchStockVideos(
  provider: StockProvider,
  opts: SearchOptions,
): Promise<StockVideo[]> {
  if (provider === "unsplash") {
    throw new Error("Unsplash does not expose a public video API. Use Pexels for stock video.");
  }
  return searchPexelsVideos(opts);
}
