import { getSetting, resolved, setSetting } from "./settings";

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
  url.searchParams.set("prompt", "consent");
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

async function getAccessToken(): Promise<string> {
  const refreshToken = await getSetting("youtube_refresh_token");
  if (!refreshToken) {
    throw new Error(
      "YouTube account not connected. Open /settings and click 'Connect YouTube'.",
    );
  }
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
    // 400 invalid_grant means the user revoked access. Clear the token so the
    // UI prompts them to reconnect.
    if (res.status === 400 && text.includes("invalid_grant")) {
      await setSetting("youtube_refresh_token", null);
      await setSetting("youtube_channel_title", null);
      throw new Error(
        "YouTube refresh token rejected (user revoked access?). Reconnect on /settings.",
      );
    }
    throw new Error(`Google token refresh failed (${res.status}): ${text}`);
  }
  const data = JSON.parse(text) as { access_token: string };
  return data.access_token;
}

async function ytFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
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

export async function getMyChannel(): Promise<ChannelInfo> {
  const res = await ytFetch("/channels?part=snippet&mine=true");
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

export async function listMyPlaylists(): Promise<Playlist[]> {
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
    const res = await ytFetch(`/playlists?${params}`);
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

export async function createPlaylist(opts: {
  title: string;
  description?: string;
  privacyStatus?: "public" | "unlisted" | "private";
}): Promise<Playlist> {
  const body = {
    snippet: { title: opts.title, description: opts.description ?? "" },
    status: { privacyStatus: opts.privacyStatus ?? "public" },
  };
  const res = await ytFetch("/playlists?part=snippet,status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`playlists.insert failed (${res.status}): ${text}`);
  const data = JSON.parse(text) as { id: string; snippet: { title: string } };
  return { id: data.id, title: data.snippet.title, itemCount: 0 };
}

export async function addToPlaylist(opts: { videoId: string; playlistId: string }): Promise<void> {
  const body = {
    snippet: {
      playlistId: opts.playlistId,
      resourceId: { kind: "youtube#video", videoId: opts.videoId },
    },
  };
  const res = await ytFetch("/playlistItems?part=snippet", {
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
  categoryId?: string;
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
export async function uploadVideo(opts: UploadVideoOpts): Promise<UploadVideoResult> {
  const token = await getAccessToken();

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

export async function setThumbnail(opts: {
  videoId: string;
  thumbnailUrl: string;
}): Promise<void> {
  const token = await getAccessToken();
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
