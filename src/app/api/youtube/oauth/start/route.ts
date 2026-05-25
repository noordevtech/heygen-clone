import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { resolved } from "@/lib/settings";
import { buildAuthUrl, youtubeRedirectUri } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/youtube/oauth/start
 *
 * Kicks off the Google OAuth consent screen. The user must have already
 * pasted their Google OAuth Web-Application Client ID + Secret into
 * /settings, and registered `<origin>/api/youtube/oauth/callback` as an
 * authorized redirect URI in Google Cloud Console.
 */
export async function GET(req: NextRequest) {
  let clientId: string;
  try {
    clientId = await resolved.youtubeOauthClientId();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Missing OAuth client";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  // Verify a secret is also set so we don't waste a consent screen on a
  // misconfigured app.
  try {
    await resolved.youtubeOauthClientSecret();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Missing OAuth client secret";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const redirectUri = youtubeRedirectUri(req);

  // Debug aid: `/api/youtube/oauth/start?debug=1` echoes the redirect_uri the
  // app will send to Google so the user can paste it verbatim into Google
  // Cloud Console.
  if (req.nextUrl.searchParams.get("debug") === "1") {
    return NextResponse.json({ redirectUri });
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
}
