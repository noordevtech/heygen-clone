import { NextResponse } from "next/server";
import { listMyPlaylists } from "@/lib/youtube";
import { withUser } from "@/lib/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withUser(async () => {
    try {
      const playlists = await listMyPlaylists();
      return NextResponse.json({ playlists });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to list playlists";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  });
}
