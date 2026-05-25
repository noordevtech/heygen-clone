import { NextRequest, NextResponse } from "next/server";
import {
  searchStockPhotos,
  searchStockVideos,
  type StockKind,
  type StockProvider,
} from "@/lib/stock";
import { withUser } from "@/lib/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROVIDERS: ReadonlySet<StockProvider> = new Set(["pexels", "unsplash"]);
const KINDS: ReadonlySet<StockKind> = new Set(["image", "video"]);

export async function GET(req: NextRequest) {
  return withUser(async () => {
  const sp = req.nextUrl.searchParams;
  const query = sp.get("q")?.trim();
  if (!query) return NextResponse.json({ error: "Missing ?q=" }, { status: 400 });

  const provider = (sp.get("provider") ?? "pexels") as StockProvider;
  const kind = (sp.get("kind") ?? "image") as StockKind;
  if (!PROVIDERS.has(provider))
    return NextResponse.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
  if (!KINDS.has(kind))
    return NextResponse.json({ error: `Unknown kind: ${kind}` }, { status: 400 });

  const orientation = sp.get("orientation") as "landscape" | "portrait" | "square" | null;
  const page = Number(sp.get("page") ?? 1);
  const perPage = Math.min(24, Math.max(4, Number(sp.get("perPage") ?? 12)));

  try {
    if (kind === "video") {
      const videos = await searchStockVideos(provider, {
        query,
        page,
        perPage,
        orientation: orientation ?? undefined,
      });
      // Keep `photos` for back-compat with existing callers; also return `videos`.
      return NextResponse.json({ kind: "video", videos });
    }
    const photos = await searchStockPhotos(provider, {
      query,
      page,
      perPage,
      orientation: orientation ?? undefined,
    });
    return NextResponse.json({ kind: "image", photos });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  });
}
