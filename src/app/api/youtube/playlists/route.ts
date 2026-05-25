import { NextResponse } from "next/server";
import { listMyPlaylists } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/youtube/playlists
 *
 * Returns the connected user's playlists for the picker in the Publishing
 * Agent step. Cheap (1-2 quota units), no caching — refresh-friendly.
 */
export async function GET() {
  try {
    const playlists = await listMyPlaylists();
    return NextResponse.json({ playlists });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list playlists";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
