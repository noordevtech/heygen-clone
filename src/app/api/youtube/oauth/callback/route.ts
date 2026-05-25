import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, getMyChannel, publicOrigin, youtubeRedirectUri } from "@/lib/youtube";
import { createConnection } from "@/lib/youtube-connections";
import { getSessionUser } from "@/lib/auth";
import { runWithUser } from "@/lib/user-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/youtube/oauth/callback?code=…&state=…
 *
 * Each successful consent creates a NEW row in `youtube_connections` — the
 * same user can have multiple connected YouTube channels (the OAuth start
 * URL uses prompt=select_account so users can pick a different Google
 * account each time).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const settingsUrl = new URL("/settings", publicOrigin(req));

  const me = await getSessionUser();
  if (!me) {
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
      // Look up the actual channel info so we can show a useful label in
      // the UI ("MyChannel" rather than "YouTube channel #2"). Best effort —
      // if this fails, the connection still gets saved with a placeholder.
      let channelTitle = "YouTube channel";
      let youtubeChannelId: string | null = null;
      let channelThumbnailUrl: string | null = null;
      try {
        const ch = await getMyChannel(tokens.refreshToken);
        channelTitle = ch.title;
        youtubeChannelId = ch.id;
        channelThumbnailUrl = ch.thumbnailUrl ?? null;
      } catch (err) {
        console.warn(
          `[oauth/callback] channels.list failed — saving connection with placeholder name: ${(err as Error).message}`,
        );
      }

      await createConnection({
        userId: me.id,
        refreshToken: tokens.refreshToken,
        channelTitle,
        youtubeChannelId,
        channelThumbnailUrl,
      });

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
