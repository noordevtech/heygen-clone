import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteConnection } from "@/lib/youtube-connections";
import { withUser } from "@/lib/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  connectionId: z.string().uuid(),
});

/**
 * POST /api/youtube/oauth/disconnect
 *
 * Removes a single YouTube connection by id. Does NOT revoke the token at
 * Google's end — the user can do that from myaccount.google.com/permissions
 * if they want to fully detach the app from their Google account.
 */
export async function POST(req: NextRequest) {
  return withUser(async (me) => {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = Body.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: "connectionId required" }, { status: 400 });
    }
    const ok = await deleteConnection(parsed.data.connectionId, me.id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  });
}
