import { NextRequest, NextResponse } from "next/server";
import { listMyPlaylists } from "@/lib/youtube";
import { getConnectionWithToken, listConnections } from "@/lib/youtube-connections";
import { withUser } from "@/lib/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/youtube/playlists?connectionId=<uuid>
 *
 * Lists playlists for a specific YouTube connection. When connectionId is
 * omitted, falls back to the user's most-recently-connected channel.
 */
export async function GET(req: NextRequest) {
  return withUser(async (me) => {
    const connectionId = req.nextUrl.searchParams.get("connectionId");
    let refreshToken: string | null = null;
    if (connectionId) {
      const conn = await getConnectionWithToken(connectionId, me.id);
      if (!conn) return NextResponse.json({ error: "Connection not found" }, { status: 404 });
      refreshToken = conn.refreshToken;
    } else {
      const conns = await listConnections(me.id);
      const latest = conns[0];
      if (!latest) {
        return NextResponse.json(
          { error: "No YouTube channel connected. Connect one on /settings first." },
          { status: 400 },
        );
      }
      const conn = await getConnectionWithToken(latest.id, me.id);
      refreshToken = conn?.refreshToken ?? null;
    }
    if (!refreshToken) {
      return NextResponse.json({ error: "Connection has no refresh token" }, { status: 500 });
    }
    try {
      const playlists = await listMyPlaylists(refreshToken);
      return NextResponse.json({ playlists });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to list playlists";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  });
}
