import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { appSettings } from "@/db/schema";
import { env } from "./env";

/**
 * Settings stored in Postgres so the user can configure API keys from the UI.
 * For each key we fall back to the corresponding env var if the DB row is
 * absent — handy for first boot before the settings page has been visited.
 */

export const SETTING_KEYS = [
  "openrouter_api_key",
  "openrouter_seedance_model",
  "openrouter_veo_model",
  "openrouter_thumbnail_model",
  "elevenlabs_api_key",
  "elevenlabs_default_model",
  "kie_api_key",
  "kie_default_video_model",
  "kie_default_image_model",
  "kie_default_music_model",
  "pexels_api_key",
  "unsplash_api_key",
  "anthropic_api_key",
  "anthropic_default_model",
  "google_api_key",
  "openai_api_key",
  "youtube_oauth_client_id",
  "youtube_oauth_client_secret",
  "youtube_refresh_token",
  "youtube_channel_title",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

const SECRET_KEYS: ReadonlySet<SettingKey> = new Set([
  "openrouter_api_key",
  "elevenlabs_api_key",
  "kie_api_key",
  "pexels_api_key",
  "unsplash_api_key",
  "anthropic_api_key",
  "google_api_key",
  "openai_api_key",
  "youtube_oauth_client_secret",
  "youtube_refresh_token",
]);

const TTL_MS = 60_000;
type CacheEntry = { value: string | null; exp: number };
const cache = new Map<SettingKey, CacheEntry>();

export async function getSetting(key: SettingKey): Promise<string | null> {
  const c = cache.get(key);
  if (c && c.exp > Date.now()) return c.value;
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  const value = row?.value ?? null;
  cache.set(key, { value, exp: Date.now() + TTL_MS });
  return value;
}

export async function setSetting(key: SettingKey, value: string | null): Promise<void> {
  if (value == null || value.trim() === "") {
    await db.delete(appSettings).where(eq(appSettings.key, key));
  } else {
    const v = value.trim();
    await db
      .insert(appSettings)
      .values({ key, value: v })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: v, updatedAt: new Date() },
      });
  }
  cache.delete(key);
}

/**
 * Resolve a setting: DB value → env fallback → throw with a helpful message.
 */
async function resolveRequired(
  key: SettingKey,
  fallback: string | undefined,
  envName: string,
): Promise<string> {
  const v = await getSetting(key);
  if (v && v.length > 0) return v;
  if (fallback && fallback.length > 0) return fallback;
  throw new Error(
    `Missing ${key}. Configure it on the Settings page (/settings) or set ${envName} in your environment.`,
  );
}

async function resolveOptional(
  key: SettingKey,
  fallback: string | undefined,
): Promise<string | undefined> {
  const v = await getSetting(key);
  if (v && v.length > 0) return v;
  return fallback && fallback.length > 0 ? fallback : undefined;
}

export const resolved = {
  openrouterApiKey: () =>
    resolveRequired("openrouter_api_key", process.env.OPENROUTER_API_KEY, "OPENROUTER_API_KEY"),
  openrouterSeedanceModel: async () =>
    (await resolveOptional("openrouter_seedance_model", env.openrouter.seedanceModel)) ??
    "bytedance/seedance-2.0",
  openrouterVeoModel: async () =>
    (await resolveOptional("openrouter_veo_model", env.openrouter.veoModel)) ?? "google/veo-3.1",
  openrouterThumbnailModel: async () =>
    (await resolveOptional(
      "openrouter_thumbnail_model",
      process.env.OPENROUTER_THUMBNAIL_MODEL,
    )) ?? "google/gemini-2.5-flash-image-preview",
  elevenlabsApiKey: () =>
    resolveRequired("elevenlabs_api_key", process.env.ELEVENLABS_API_KEY, "ELEVENLABS_API_KEY"),
  elevenlabsDefaultModel: async () =>
    (await resolveOptional("elevenlabs_default_model", env.elevenlabs.defaultModel)) ??
    "eleven_multilingual_v2",
  kieApiKey: () => resolveRequired("kie_api_key", process.env.KIE_API_KEY, "KIE_API_KEY"),
  kieDefaultVideoModel: async () =>
    (await resolveOptional("kie_default_video_model", process.env.KIE_DEFAULT_VIDEO_MODEL)) ??
    "veo3.1",
  kieDefaultImageModel: async () =>
    (await resolveOptional("kie_default_image_model", process.env.KIE_DEFAULT_IMAGE_MODEL)) ??
    "flux-kontext",
  kieDefaultMusicModel: async () =>
    (await resolveOptional("kie_default_music_model", process.env.KIE_DEFAULT_MUSIC_MODEL)) ??
    "V5",
  pexelsApiKey: () => resolveRequired("pexels_api_key", process.env.PEXELS_API_KEY, "PEXELS_API_KEY"),
  unsplashApiKey: () =>
    resolveRequired("unsplash_api_key", process.env.UNSPLASH_API_KEY, "UNSPLASH_API_KEY"),
  anthropicApiKey: () =>
    resolveRequired("anthropic_api_key", process.env.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY"),
  anthropicDefaultModel: async () =>
    (await resolveOptional("anthropic_default_model", process.env.ANTHROPIC_DEFAULT_MODEL)) ??
    "claude-opus-4-7",
  googleApiKey: () =>
    resolveRequired("google_api_key", process.env.GOOGLE_API_KEY, "GOOGLE_API_KEY"),
  openaiApiKey: () =>
    resolveRequired("openai_api_key", process.env.OPENAI_API_KEY, "OPENAI_API_KEY"),
  youtubeOauthClientId: () =>
    resolveRequired(
      "youtube_oauth_client_id",
      process.env.YOUTUBE_OAUTH_CLIENT_ID,
      "YOUTUBE_OAUTH_CLIENT_ID",
    ),
  youtubeOauthClientSecret: () =>
    resolveRequired(
      "youtube_oauth_client_secret",
      process.env.YOUTUBE_OAUTH_CLIENT_SECRET,
      "YOUTUBE_OAUTH_CLIENT_SECRET",
    ),
};

export type SettingPublic = {
  key: SettingKey;
  /** For non-secret keys: the literal value. For secrets: just the last 4 chars. */
  hint: string | null;
  hasValue: boolean;
  source: "db" | "env" | "unset";
  /** True if this setting holds an API key and should be rendered as a password input. */
  secret: boolean;
};

const ENV_FALLBACKS: Record<SettingKey, string | undefined> = {
  openrouter_api_key: process.env.OPENROUTER_API_KEY,
  openrouter_seedance_model: env.openrouter.seedanceModel,
  openrouter_veo_model: env.openrouter.veoModel,
  openrouter_thumbnail_model: process.env.OPENROUTER_THUMBNAIL_MODEL,
  elevenlabs_api_key: process.env.ELEVENLABS_API_KEY,
  elevenlabs_default_model: env.elevenlabs.defaultModel,
  kie_api_key: process.env.KIE_API_KEY,
  kie_default_video_model: process.env.KIE_DEFAULT_VIDEO_MODEL,
  kie_default_image_model: process.env.KIE_DEFAULT_IMAGE_MODEL,
  kie_default_music_model: process.env.KIE_DEFAULT_MUSIC_MODEL,
  pexels_api_key: process.env.PEXELS_API_KEY,
  unsplash_api_key: process.env.UNSPLASH_API_KEY,
  anthropic_api_key: process.env.ANTHROPIC_API_KEY,
  anthropic_default_model: process.env.ANTHROPIC_DEFAULT_MODEL,
  google_api_key: process.env.GOOGLE_API_KEY,
  openai_api_key: process.env.OPENAI_API_KEY,
  youtube_oauth_client_id: process.env.YOUTUBE_OAUTH_CLIENT_ID,
  youtube_oauth_client_secret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET,
  youtube_refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
  youtube_channel_title: undefined,
};

export async function listSettings(): Promise<SettingPublic[]> {
  const out: SettingPublic[] = [];
  for (const key of SETTING_KEYS) {
    const dbValue = await getSetting(key);
    const envValue = ENV_FALLBACKS[key];
    const effective = dbValue ?? (envValue && envValue.length > 0 ? envValue : null);
    const secret = SECRET_KEYS.has(key);
    out.push({
      key,
      hasValue: !!effective,
      source: dbValue ? "db" : envValue && envValue.length > 0 ? "env" : "unset",
      hint: effective
        ? secret
          ? `••••${effective.slice(-4)}`
          : effective
        : null,
      secret,
    });
  }
  return out;
}
