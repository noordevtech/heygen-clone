import { NextRequest, NextResponse } from "next/server";
import { setSetting } from "@/lib/settings";
import { exchangeCodeForTokens, getMyChannel, publicOrigin, youtubeRedirectUri } from "@/lib/youtube";
import { getSessionUser } from "@/lib/auth";
import { runWithUser } from "@/lib/user-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/youtube/oauth/callback?code=…&state=…
 *
 * Stores the refresh token under the currently-signed-in user so each user
 * connects their own YouTube channel. Falls back to a redirect to /login if
 * the session expired between consent screen and callback.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const settingsUrl = new URL("/settings", publicOrigin(req));

  const me = await getSessionUser();
  if (!me) {
    // Session expired mid-OAuth — send them back through login so they
    // can retry. Preserve the destination.
    const loginUrl = new URL("/login", publicOrigin(req));
    loginUrl.searchParams.set("next", "/settings");
    return NextResponse.redirect(loginUrl);
  }

  return runWithUser(me.id, async () => {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errParam = url.searchParams.get("error");
    const cookieState = req.cookies.get("yt_oauth_state")?.value ?? null;

    if (errParam) {
      settingsUrl.searchParams.set("yt_error", errParam);
      return NextResponse.redirect(settingsUrl);
    }
    if (!code || !state || !cookieState || state !== cookieState) {
      settingsUrl.searchParams.set("yt_error", "Invalid OAuth state (CSRF check failed).");
      return NextResponse.redirect(settingsUrl);
    }

    const redirectUri = youtubeRedirectUri(req);
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
  });
}
