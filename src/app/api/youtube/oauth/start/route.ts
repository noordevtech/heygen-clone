import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { resolved } from "@/lib/settings";
import { buildAuthUrl, youtubeRedirectUri } from "@/lib/youtube";
import { withUser } from "@/lib/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/youtube/oauth/start
 *
 * Runs in the current user's context so the OAuth client id/secret are
 * resolved from their settings (falling back to admin's). The CSRF state
 * cookie is stamped with the user id too — the callback verifies the same
 * user is still signed in before swapping the code for tokens.
 */
export async function GET(req: NextRequest) {
  return withUser(async (me) => {
    let clientId: string;
    try {
      clientId = await resolved.youtubeOauthClientId();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Missing OAuth client";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    try {
      await resolved.youtubeOauthClientSecret();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Missing OAuth client secret";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const redirectUri = youtubeRedirectUri(req);
    if (req.nextUrl.searchParams.get("debug") === "1") {
      return NextResponse.json({ redirectUri, userId: me.id });
    }

    const state = randomBytes(24).toString("hex");
    const url = buildAuthUrl({ clientId, redirectUri, state });

    const res = NextResponse.redirect(url);
    res.cookies.set("yt_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: redirectUri.startsWith("https:"),
      path: "/",
      maxAge: 600,
    });
    return res;
  });
}
