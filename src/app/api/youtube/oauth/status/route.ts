import { NextResponse } from "next/server";
import { listConnections } from "@/lib/youtube-connections";
import { withUser } from "@/lib/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/youtube/oauth/status
 *
 * Returns all YouTube connections owned by the signed-in user (multi-channel
 * support). Kept the legacy `connected` + `channelTitle` fields for
 * backward compat with older clients — they reflect the most recently
 * connected channel.
 */
export async function GET() {
  return withUser(async (me) => {
    const connections = await listConnections(me.id);
    const latest = connections[0];
    return NextResponse.json({
      connections,
      connected: connections.length > 0,
      channelTitle: latest?.channelTitle ?? null,
    });
  });
}
