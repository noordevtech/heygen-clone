import { NextRequest, NextResponse } from "next/server";
import { searchPexels } from "@/lib/stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const query = sp.get("q")?.trim();
  if (!query) return NextResponse.json({ error: "Missing ?q=" }, { status: 400 });
  const orientation = sp.get("orientation") as "landscape" | "portrait" | "square" | null;
  const page = Number(sp.get("page") ?? 1);
  const perPage = Math.min(24, Math.max(4, Number(sp.get("perPage") ?? 12)));
  try {
    const photos = await searchPexels({
      query,
      page,
      perPage,
      orientation: orientation ?? undefined,
    });
    return NextResponse.json({ photos });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
