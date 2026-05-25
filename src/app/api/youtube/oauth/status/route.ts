import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/youtube/oauth/status
 *
 * Lightweight check used by the Agent + Settings pages to decide whether
 * to show "Connect" or "Connected as X". Does NOT call YouTube — just
 * reads what we've stored locally.
 */
export async function GET() {
  const refreshToken = await getSetting("youtube_refresh_token");
  const channelTitle = await getSetting("youtube_channel_title");
  return NextResponse.json({
    connected: !!refreshToken,
    channelTitle: channelTitle ?? null,
  });
}
