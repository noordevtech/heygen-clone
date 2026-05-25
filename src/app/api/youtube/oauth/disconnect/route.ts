import { NextResponse } from "next/server";
import { setSetting } from "@/lib/settings";
import { withUser } from "@/lib/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return withUser(async () => {
    await setSetting("youtube_refresh_token", null);
    await setSetting("youtube_channel_title", null);
    return NextResponse.json({ ok: true });
  });
}
