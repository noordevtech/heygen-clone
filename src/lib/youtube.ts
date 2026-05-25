import { resolved } from "./settings";

/**
 * Tiny YouTube Data API v3 client used by the Publishing Agent.
 *
 * Auth: Google OAuth 2.0. The user installs a Web-Application client in their
 * Google Cloud project (with the Studio's `/api/youtube/oauth/callback` as a
 * redirect URI), pastes the client id + secret into /settings, then clicks
 * "Connect YouTube". We store the long-lived refresh token in app_settings
 * and exchange it for an access token on each API call (3600s validity, no
 * caching yet — fine for a hand-driven UI).
 *
 * Scope: `youtube.upload` + `youtube` — enough to upload, schedule, set
 * thumbnails, and manage playlists. End-screens are NOT in YouTube Data API
 * v3; the documented surface only covers reading existing ones. We surface
 * that limitation in the UI rather than pretending to support it.
 */

const YT_API = "https://www.googleapis.com/youtube/v3";
const YT_UPLOAD = "https://www.googleapis.com/upload/youtube/v3";
const OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
];

/**
 * Resolve the public origin of the deployed app. Behind Railway / any reverse
 * proxy, `new URL(req.url).origin` can resolve to `http://internal-host` —
 * Google then rejects the OAuth flow with `redirect_uri_mismatch` because the
 * registered URI is https. We respect the standard `x-forwarded-*` headers
 * and allow an explicit `PUBLIC_APP_URL` env override for stubborn setups.
 */
export function publicOrigin(req: Request): string {
  const override = process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (override) return override.replace(/\/+$/, "");
  const h = req.headers;
  const proto = (h.get("x-forwarded-proto") || "").split(",")[0].trim();
  const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim();
  if (proto && host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

export function youtubeRedirectUri(req: Request): string {
  return `${publicOrigin(req)}/api/youtube/oauth/callback`;
}

export function buildAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", opts.clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  // `select_account` lets the user pick a different Google account each time
  // — required for the multi-channel flow. `consent` forces the consent
  // screen so we always get back a refresh_token (Google only returns it
  // when the user explicitly consents).
  url.searchParams.set("prompt", "select_account consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("scope", OAUTH_SCOPES.join(" "));
  url.searchParams.set("state", opts.state);
  return url.toString();
}

export async function exchangeCodeForTokens(opts: {
  code: string;
  redirectUri: string;
}): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
  const clientId = await resolved.youtubeOauthClientId();
  const clientSecret = await resolved.youtubeOauthClientSecret();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: opts.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status}): ${text}`);
  const data = JSON.parse(text) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Swap a long-lived refresh token for a short-lived access token. The caller
 * owns the refresh token (looked up in `youtube_connections` by connection id)
 * — this function is pure and stateless aside from the Google call.
 */
export async function exchangeRefreshTokenForAccessToken(
  refreshToken: string,
): Promise<string> {
  const clientId = await resolved.youtubeOauthClientId();
  const clientSecret = await resolved.youtubeOauthClientSecret();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 400 && text.includes("invalid_grant")) {
      throw new Error(
        "YouTube refresh token rejected (user revoked access?). Reconnect on /settings.",
      );
    }
    throw new Error(`Google token refresh failed (${res.status}): ${text}`);
  }
  const data = JSON.parse(text) as { access_token: string };
  return data.access_token;
}

async function ytFetch(
  refreshToken: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await exchangeRefreshTokenForAccessToken(refreshToken);
  return fetch(`${YT_API}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      authorization: `Bearer ${token}`,
    },
  });
}

export type ChannelInfo = {
  id: string;
  title: string;
  thumbnailUrl?: string;
};

export async function getMyChannel(refreshToken: string): Promise<ChannelInfo> {
  const res = await ytFetch(refreshToken, "/channels?part=snippet&mine=true");
  const text = await res.text();
  if (!res.ok) throw new Error(`channels.list failed (${res.status}): ${text}`);
  const data = JSON.parse(text) as {
    items?: Array<{ id: string; snippet: { title: string; thumbnails?: { default?: { url: string } } } }>;
  };
  const ch = data.items?.[0];
  if (!ch) throw new Error("No YouTube channel found on this account.");
  return {
    id: ch.id,
    title: ch.snippet.title,
    thumbnailUrl: ch.snippet.thumbnails?.default?.url,
  };
}

export type Playlist = { id: string; title: string; itemCount: number };

export async function listMyPlaylists(refreshToken: string): Promise<Playlist[]> {
  const out: Playlist[] = [];
  let pageToken: string | undefined;
  // 1-2 pages is plenty for typical creators; cap at 200.
  for (let i = 0; i < 4; i++) {
    const params = new URLSearchParams({
      part: "snippet,contentDetails",
      mine: "true",
      maxResults: "50",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const res = await ytFetch(refreshToken, `/playlists?${params}`);
    const text = await res.text();
    if (!res.ok) throw new Error(`playlists.list failed (${res.status}): ${text}`);
    const data = JSON.parse(text) as {
      items?: Array<{
        id: string;
        snippet: { title: string };
        contentDetails: { itemCount: number };
      }>;
      nextPageToken?: string;
    };
    for (const p of data.items ?? []) {
      out.push({ id: p.id, title: p.snippet.title, itemCount: p.contentDetails.itemCount });
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return out;
}

export async function createPlaylist(
  refreshToken: string,
  opts: {
    title: string;
    description?: string;
    privacyStatus?: "public" | "unlisted" | "private";
  },
): Promise<Playlist> {
  const body = {
    snippet: { title: opts.title, description: opts.description ?? "" },
    status: { privacyStatus: opts.privacyStatus ?? "public" },
  };
  const res = await ytFetch(refreshToken, "/playlists?part=snippet,status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`playlists.insert failed (${res.status}): ${text}`);
  const data = JSON.parse(text) as { id: string; snippet: { title: string } };
  return { id: data.id, title: data.snippet.title, itemCount: 0 };
}

export async function addToPlaylist(
  refreshToken: string,
  opts: { videoId: string; playlistId: string },
): Promise<void> {
  const body = {
    snippet: {
      playlistId: opts.playlistId,
      resourceId: { kind: "youtube#video", videoId: opts.videoId },
    },
  };
  const res = await ytFetch(refreshToken, "/playlistItems?part=snippet", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`playlistItems.insert failed (${res.status}): ${text}`);
}

export type UploadVideoOpts = {
  videoUrl: string;
  title: string;
  description: string;
  tags?: string[];
  /** YouTube category id. See https://developers.google.com/youtube/v3/docs/videoCategories/list
   *  for the canonical list. Common ones: 22 = People & Blogs (default),
   *  27 = Education, 24 = Entertainment, 28 = Science & Technology. */
  categoryId?: string;
  /** BCP-47 code for the title/description language (e.g. "en"). */
  defaultLanguage?: string;
  /** BCP-47 code for the spoken audio language. Setting this is what tells
   *  YouTube the captions you upload separately are aligned to English audio. */
  defaultAudioLanguage?: string;
  /** Final privacy. If publishAt is set, we upload as "private" first and let
   *  YouTube flip it to public at that timestamp. */
  privacyStatus: "public" | "unlisted" | "private";
  publishAt?: string;
  madeForKids?: boolean;
};

export type UploadVideoResult = {
  videoId: string;
  watchUrl: string;
  studioUrl: string;
};

/**
 * Upload a video using multipart/related. Works for clips up to ~256MB,
 * which covers every longform render this app produces today. For bigger
 * files we'd switch to resumable uploads (the same endpoint family,
 * different content-type negotiation).
 */
export async function uploadVideo(
  refreshToken: string,
  opts: UploadVideoOpts,
): Promise<UploadVideoResult> {
  const token = await exchangeRefreshTokenForAccessToken(refreshToken);

  // Pull bytes from R2 (or wherever the video lives).
  const videoRes = await fetch(opts.videoUrl);
  if (!videoRes.ok) {
    throw new Error(`Failed to fetch source video (${videoRes.status}) from ${opts.videoUrl}`);
  }
  const videoBytes = new Uint8Array(await videoRes.arrayBuffer());
  const contentType = videoRes.headers.get("content-type") || "video/mp4";

  const scheduling = opts.publishAt
    ? { privacyStatus: "private" as const, publishAt: opts.publishAt }
    : { privacyStatus: opts.privacyStatus };

  const metadata = {
    snippet: {
      title: opts.title.slice(0, 100),
      description: opts.description.slice(0, 5000),
      tags: opts.tags?.slice(0, 30),
      categoryId: opts.categoryId ?? "22",
      ...(opts.defaultLanguage ? { defaultLanguage: opts.defaultLanguage } : {}),
      ...(opts.defaultAudioLanguage
        ? { defaultAudioLanguage: opts.defaultAudioLanguage }
        : {}),
    },
    status: {
      ...scheduling,
      selfDeclaredMadeForKids: opts.madeForKids ?? false,
    },
  };

  // Build a multipart/related body by hand. crlfs are required between parts.
  const boundary = `yt-upload-${Math.random().toString(16).slice(2)}`;
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n--${boundary}\r\n` +
      `Content-Type: ${contentType}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);

  const body = new Uint8Array(head.length + videoBytes.length + tail.length);
  body.set(head, 0);
  body.set(videoBytes, head.length);
  body.set(tail, head.length + videoBytes.length);

  const res = await fetch(
    `${YT_UPLOAD}/videos?uploadType=multipart&part=snippet,status`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/related; boundary=${boundary}`,
        "content-length": String(body.length),
      },
      body,
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`videos.insert failed (${res.status}): ${text}`);
  const data = JSON.parse(text) as { id: string };
  return {
    videoId: data.id,
    watchUrl: `https://youtu.be/${data.id}`,
    studioUrl: `https://studio.youtube.com/video/${data.id}/edit`,
  };
}

export async function setThumbnail(
  refreshToken: string,
  opts: {
    videoId: string;
    thumbnailUrl: string;
  },
): Promise<void> {
  const token = await exchangeRefreshTokenForAccessToken(refreshToken);
  const imgRes = await fetch(opts.thumbnailUrl);
  if (!imgRes.ok) {
    throw new Error(`Failed to fetch thumbnail (${imgRes.status}) from ${opts.thumbnailUrl}`);
  }
  const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get("content-type") || "image/jpeg";
  const res = await fetch(
    `${YT_UPLOAD}/thumbnails/set?videoId=${encodeURIComponent(opts.videoId)}&uploadType=media`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": contentType,
        "content-length": String(imgBytes.length),
      },
      body: imgBytes,
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`thumbnails.set failed (${res.status}): ${text}`);
}

/**
 * Pick a "good" upcoming publish slot.
 *
 * Heuristic based on commonly-cited YouTube best practices: Tue / Thu / Sat
 * at 15:00 local time tend to maximize the next-24h velocity for evergreen
 * content. Returns the next such slot strictly in the future, as an ISO
 * string. Cheap, deterministic, and good enough until we wire up YouTube
 * Analytics for a data-driven version.
 */
export function optimalPublishTime(now: Date = new Date()): string {
  const target = new Date(now);
  target.setSeconds(0, 0);
  target.setMinutes(0);
  target.setHours(15);
  const GOOD_DAYS = new Set([2, 4, 6]); // Tue, Thu, Sat (0 = Sun)
  for (let i = 0; i < 14; i++) {
    if (GOOD_DAYS.has(target.getDay()) && target.getTime() > now.getTime()) {
      return target.toISOString();
    }
    target.setDate(target.getDate() + 1);
    target.setHours(15);
  }
  // Fallback: 2 hours from now.
  return new Date(now.getTime() + 2 * 3_600_000).toISOString();
}

export type UploadCaptionOpts = {
  videoId: string;
  /** BCP-47 code, e.g. "en". Becomes `snippet.language`. */
  language: string;
  /** Display name shown in the YT captions picker (e.g. "English"). */
  name: string;
  /** SRT or VTT content. We use SRT throughout. */
  body: string;
  /** When true, YouTube treats this as a draft and won't show it. Default false. */
  isDraft?: boolean;
};

/**
 * Upload a caption track for an existing video via the YouTube Data API v3
 * `captions.insert` endpoint. Multipart/related body — metadata JSON then
 * the raw SRT bytes. The endpoint accepts text/plain SRT without an
 * explicit format hint; YouTube infers from content.
 */
export async function uploadCaption(
  refreshToken: string,
  opts: UploadCaptionOpts,
): Promise<{ id: string }> {
  const token = await exchangeRefreshTokenForAccessToken(refreshToken);
  const metadata = {
    snippet: {
      videoId: opts.videoId,
      language: opts.language,
      name: opts.name,
      isDraft: opts.isDraft ?? false,
    },
  };

  const boundary = `yt-caption-${Math.random().toString(16).slice(2)}`;
  const enc = new TextEncoder();
  const captionBytes = enc.encode(opts.body);
  const head = enc.encode(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) +
      `\r\n--${boundary}\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--\r\n`);

  const body = new Uint8Array(head.length + captionBytes.length + tail.length);
  body.set(head, 0);
  body.set(captionBytes, head.length);
  body.set(tail, head.length + captionBytes.length);

  const res = await fetch(
    `${YT_UPLOAD}/captions?part=snippet&uploadType=multipart`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/related; boundary=${boundary}`,
        "content-length": String(body.length),
      },
      body,
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`captions.insert failed (${res.status}): ${text}`);
  const data = JSON.parse(text) as { id: string };
  return { id: data.id };
}
