import { NextResponse } from "next/server";
import { setSetting } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/youtube/oauth/disconnect
 *
 * Clears the stored refresh token + cached channel title. Does not
 * proactively revoke the token at Google's end — the user can do that
 * from myaccount.google.com/permissions if they want.
 */
export async function POST() {
  await setSetting("youtube_refresh_token", null);
  await setSetting("youtube_channel_title", null);
  return NextResponse.json({ ok: true });
}
