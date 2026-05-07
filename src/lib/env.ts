function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optional(value: string | undefined, fallback = ""): string {
  return value && value.length > 0 ? value : fallback;
}

export const env = {
  openrouter: {
    apiKey: () => required("OPENROUTER_API_KEY", process.env.OPENROUTER_API_KEY),
    baseUrl: optional(process.env.OPENROUTER_BASE_URL, "https://openrouter.ai/api/v1"),
    seedanceModel: optional(process.env.OPENROUTER_SEEDANCE_MODEL, "bytedance/seedance-1-pro"),
    veoModel: optional(process.env.OPENROUTER_VEO_MODEL, "google/veo-3"),
    referer: optional(process.env.OPENROUTER_REFERER, "http://localhost:3000"),
    appName: optional(process.env.OPENROUTER_APP_NAME, "heygen-clone"),
  },
  elevenlabs: {
    apiKey: () => required("ELEVENLABS_API_KEY", process.env.ELEVENLABS_API_KEY),
    defaultModel: optional(process.env.ELEVENLABS_DEFAULT_MODEL, "eleven_multilingual_v2"),
  },
  r2: {
    accountId: () => required("R2_ACCOUNT_ID", process.env.R2_ACCOUNT_ID),
    accessKeyId: () => required("R2_ACCESS_KEY_ID", process.env.R2_ACCESS_KEY_ID),
    secretAccessKey: () => required("R2_SECRET_ACCESS_KEY", process.env.R2_SECRET_ACCESS_KEY),
    bucket: () => required("R2_BUCKET", process.env.R2_BUCKET),
    publicBaseUrl: optional(process.env.R2_PUBLIC_BASE_URL),
  },
  app: {
    name: optional(process.env.NEXT_PUBLIC_APP_NAME, "AI Reels Studio"),
  },
};
