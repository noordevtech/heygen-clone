import { NextRequest, NextResponse } from "next/server";
import { setSetting } from "@/lib/settings";
import { exchangeCodeForTokens, getMyChannel } from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/youtube/oauth/callback?code=…&state=…
 *
 * Google redirects here after consent. We verify the CSRF state cookie,
 * swap the auth code for tokens, store the long-lived refresh_token in
 * app_settings, and stash the channel title for display. On failure we
 * bounce back to /settings with an `error` query param.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errParam = url.searchParams.get("error");
  const cookieState = req.cookies.get("yt_oauth_state")?.value ?? null;

  const settingsUrl = new URL("/settings", url.origin);

  if (errParam) {
    settingsUrl.searchParams.set("yt_error", errParam);
    return NextResponse.redirect(settingsUrl);
  }
  if (!code || !state || !cookieState || state !== cookieState) {
    settingsUrl.searchParams.set("yt_error", "Invalid OAuth state (CSRF check failed).");
    return NextResponse.redirect(settingsUrl);
  }

  const redirectUri = `${url.origin}/api/youtube/oauth/callback`;
  try {
    const tokens = await exchangeCodeForTokens({ code, redirectUri });
    if (!tokens.refreshToken) {
      throw new Error(
        "Google did not return a refresh token. Revoke this app at myaccount.google.com/permissions and try again so the consent prompt re-shows.",
      );
    }
    await setSetting("youtube_refresh_token", tokens.refreshToken);
    try {
      const ch = await getMyChannel();
      await setSetting("youtube_channel_title", ch.title);
    } catch {
      // Channel lookup is best-effort; the refresh token is still valid.
    }
    settingsUrl.searchParams.set("yt_connected", "1");
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth exchange failed";
    settingsUrl.searchParams.set("yt_error", message);
  }
  const res = NextResponse.redirect(settingsUrl);
  res.cookies.delete("yt_oauth_state");
  return res;
}
