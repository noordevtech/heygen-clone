import { NextResponse } from "next/server";
import { getSetting } from "@/lib/settings";
import { withUser } from "@/lib/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withUser(async () => {
    // Per-user lookup. youtube_refresh_token is in NEVER_FALLBACK_TO_ADMIN
    // so the response reflects this user's own connection, not the admin's.
    const refreshToken = await getSetting("youtube_refresh_token");
    const channelTitle = await getSetting("youtube_channel_title");
    return NextResponse.json({
      connected: !!refreshToken,
      channelTitle: channelTitle ?? null,
    });
  });
}
