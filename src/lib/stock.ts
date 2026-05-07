import { resolved } from "./settings";

/**
 * Pexels image search.
 *
 * Free key, generous quota (200 req/hour, 20k req/month). Photos are
 * royalty-free for commercial use; attribution is appreciated but not
 * legally required.
 *
 * Reference: https://www.pexels.com/api/documentation/#photos-search
 */

const BASE = "https://api.pexels.com/v1";

export type StockPhoto = {
  id: number;
  width: number;
  height: number;
  /** Best quality URL we use for compositing (large2x or original). */
  url: string;
  /** Smaller URL for preview thumbnails in the editor. */
  thumbUrl: string;
  photographer: string;
  photographerUrl?: string;
  pageUrl: string;
  alt?: string;
};

type PexelsResponse = {
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

export type SearchOptions = {
  query: string;
  page?: number;
  perPage?: number;
  /** Bias the result toward the requested aspect ratio. */
  orientation?: "landscape" | "portrait" | "square";
};

export async function searchPexels(opts: SearchOptions): Promise<StockPhoto[]> {
  const params = new URLSearchParams({
    query: opts.query,
    per_page: String(opts.perPage ?? 12),
    page: String(opts.page ?? 1),
    ...(opts.orientation ? { orientation: opts.orientation } : {}),
  });
  const res = await fetch(`${BASE}/search?${params.toString()}`, {
    headers: { authorization: await resolved.pexelsApiKey() },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Pexels search failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as PexelsResponse;
  return json.photos.map((p) => ({
    id: p.id,
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
