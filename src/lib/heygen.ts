import { resolved } from "./settings";
import type { AspectRatio } from "./types";

/**
 * HeyGen REST client. Two API surfaces are used:
 *  - v2 (`/v2/avatars`, `/v2/voices`, `/v2/video/generate`) for listing
 *    assets and kicking off a render.
 *  - v1 (`/v1/video_status.get`) for polling render status.
 *
 * Auth is the same on both: a flat `X-Api-Key` header. The key is resolved
 * per-user from the settings table (DB → env → throw) like every other
 * provider helper.
 */

const BASE = "https://api.heygen.com";

async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  return {
    "x-api-key": await resolved.heygenApiKey(),
    accept: "application/json",
    ...extra,
  };
}

export type HeygenAvatar = {
  avatarId: string;
  name: string;
  gender?: string;
  previewImageUrl?: string;
  previewVideoUrl?: string;
  premium?: boolean;
};

export type HeygenVoice = {
  voiceId: string;
  name: string;
  language?: string;
  gender?: string;
  previewAudio?: string;
  supportPause?: boolean;
  emotionSupport?: boolean;
};

type AvatarsResponse = {
  error: unknown;
  data?: {
    avatars?: Array<{
      avatar_id: string;
      avatar_name: string;
      gender?: string;
      preview_image_url?: string;
      preview_video_url?: string;
      premium?: boolean;
    }>;
  };
};

type VoicesResponse = {
  error: unknown;
  data?: {
    voices?: Array<{
      voice_id: string;
      name: string;
      language?: string;
      gender?: string;
      preview_audio?: string;
      support_pause?: boolean;
      emotion_support?: boolean;
    }>;
  };
};

export async function listAvatars(): Promise<HeygenAvatar[]> {
  const res = await fetch(`${BASE}/v2/avatars`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HeyGen avatars failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as AvatarsResponse;
  const avatars = json.data?.avatars ?? [];
  return avatars.map((a) => ({
    avatarId: a.avatar_id,
    name: a.avatar_name,
    gender: a.gender,
    previewImageUrl: a.preview_image_url,
    previewVideoUrl: a.preview_video_url,
    premium: a.premium,
  }));
}

export async function listVoices(): Promise<HeygenVoice[]> {
  const res = await fetch(`${BASE}/v2/voices`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HeyGen voices failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as VoicesResponse;
  const voices = json.data?.voices ?? [];
  return voices.map((v) => ({
    voiceId: v.voice_id,
    name: v.name,
    language: v.language,
    gender: v.gender,
    previewAudio: v.preview_audio,
    supportPause: v.support_pause,
    emotionSupport: v.emotion_support,
  }));
}

/** Map our 3 aspect ratios to HeyGen pixel dimensions (16:9 = 1280x720). */
export function aspectToDimension(aspect: AspectRatio): { width: number; height: number } {
  switch (aspect) {
    case "9:16":
      return { width: 720, height: 1280 };
    case "1:1":
      return { width: 1080, height: 1080 };
    case "16:9":
    default:
      return { width: 1280, height: 720 };
  }
}

export type GenerateAvatarVideoOptions = {
  avatarId: string;
  avatarStyle?: "normal" | "circle" | "closeUp";
  voiceId: string;
  inputText: string;
  speed?: number;
  aspect: AspectRatio;
  /** Solid background color (hex, e.g. "#f6f6fc"). Defaults to white. */
  background?: string;
  title?: string;
};

/** Kick off a render. Returns HeyGen's `video_id` for status polling. */
export async function generateAvatarVideo(opts: GenerateAvatarVideoOptions): Promise<string> {
  const { width, height } = aspectToDimension(opts.aspect);
  const body = {
    ...(opts.title ? { title: opts.title.slice(0, 100) } : {}),
    video_inputs: [
      {
        character: {
          type: "avatar",
          avatar_id: opts.avatarId,
          avatar_style: opts.avatarStyle ?? "normal",
        },
        voice: {
          type: "text",
          input_text: opts.inputText,
          voice_id: opts.voiceId,
          speed: opts.speed ?? 1.0,
        },
        background: {
          type: "color",
          value: opts.background ?? "#ffffff",
        },
      },
    ],
    dimension: { width, height },
  };
  const res = await fetch(`${BASE}/v2/video/generate`, {
    method: "POST",
    headers: await authHeaders({ "content-type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HeyGen generate failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { error: unknown; data?: { video_id?: string } };
  if (json.error) throw new Error(`HeyGen generate error: ${JSON.stringify(json.error)}`);
  const videoId = json.data?.video_id;
  if (!videoId) throw new Error(`HeyGen generate returned no video_id: ${JSON.stringify(json)}`);
  return videoId;
}

export type HeygenVideoStatus = {
  status: "pending" | "waiting" | "processing" | "completed" | "failed" | string;
  videoUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
  error?: string;
};

export async function getVideoStatus(videoId: string): Promise<HeygenVideoStatus> {
  const res = await fetch(`${BASE}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HeyGen status failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    code?: number;
    data?: {
      status?: string;
      video_url?: string;
      thumbnail_url?: string;
      duration?: number;
      error?: unknown;
    };
  };
  const d = json.data ?? {};
  return {
    status: d.status ?? "pending",
    videoUrl: d.video_url,
    thumbnailUrl: d.thumbnail_url,
    duration: d.duration,
    error: d.error ? (typeof d.error === "string" ? d.error : JSON.stringify(d.error)) : undefined,
  };
}

/**
 * Poll until the render completes or fails. HeyGen renders take ~1–5 min, so
 * we poll every 5s up to a generous cap (well under the worker's 45-min lock).
 */
export async function waitForVideo(
  videoId: string,
  onProgress?: (status: HeygenVideoStatus) => void,
  { intervalMs = 5000, timeoutMs = 20 * 60 * 1000 }: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<{ videoUrl: string; thumbnailUrl?: string; duration?: number }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const s = await getVideoStatus(videoId);
    onProgress?.(s);
    if (s.status === "completed") {
      if (!s.videoUrl) throw new Error("HeyGen reported completed but returned no video_url");
      return { videoUrl: s.videoUrl, thumbnailUrl: s.thumbnailUrl, duration: s.duration };
    }
    if (s.status === "failed") {
      throw new Error(`HeyGen render failed: ${s.error ?? "unknown error"}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`HeyGen render timed out after ${Math.round(timeoutMs / 60000)} min (last status: ${s.status})`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
