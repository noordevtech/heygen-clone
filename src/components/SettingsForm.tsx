"use client";

import { useEffect, useState } from "react";

type SettingKey =
  | "openrouter_api_key"
  | "openrouter_seedance_model"
  | "openrouter_veo_model"
  | "openrouter_thumbnail_model"
  | "elevenlabs_api_key"
  | "elevenlabs_default_model"
  | "kie_api_key"
  | "kie_default_video_model"
  | "kie_default_image_model"
  | "kie_default_music_model"
  | "pexels_api_key"
  | "unsplash_api_key"
  | "anthropic_api_key"
  | "anthropic_default_model"
  | "google_api_key"
  | "openai_api_key"
  | "youtube_oauth_client_id"
  | "youtube_oauth_client_secret"
  | "youtube_refresh_token"
  | "youtube_channel_title";

type SettingPublic = {
  key: SettingKey;
  hint: string | null;
  hasValue: boolean;
  source: "db" | "env" | "unset";
  secret: boolean;
};

const FIELDS: { key: SettingKey; label: string; help: string; placeholder: string }[] = [
  {
    key: "openrouter_api_key",
    label: "OpenRouter API key",
    help: "Used to call /api/v1/videos for Seedance & Veo. Find it at openrouter.ai/keys.",
    placeholder: "sk-or-…",
  },
  {
    key: "openrouter_seedance_model",
    label: "Seedance model slug",
    help: "Override the default Seedance model. Examples: bytedance/seedance-2.0, bytedance/seedance-2.0-fast, bytedance/seedance-1-5-pro.",
    placeholder: "bytedance/seedance-2.0",
  },
  {
    key: "openrouter_veo_model",
    label: "Veo model slug",
    help: "Override the default Veo model. Example: google/veo-3.1.",
    placeholder: "google/veo-3.1",
  },
  {
    key: "openrouter_thumbnail_model",
    label: "OpenRouter thumbnail model",
    help: "Image model used by the Agent's 'Generate thumbnail' button. OpenRouter doesn't proxy DALL-E 3 — use Gemini (google/gemini-2.5-flash-image-preview), Nano Banana 2 (google/gemini-3.1-flash-image-preview), or FLUX (black-forest-labs/flux-2-max).",
    placeholder: "google/gemini-2.5-flash-image-preview",
  },
  {
    key: "elevenlabs_api_key",
    label: "ElevenLabs API key",
    help: "Used for voice listing and TTS. Find it at elevenlabs.io → Profile → API Keys.",
    placeholder: "…",
  },
  {
    key: "elevenlabs_default_model",
    label: "ElevenLabs default TTS model",
    help: "Default model used for synthesis. Example: eleven_multilingual_v2.",
    placeholder: "eleven_multilingual_v2",
  },
  {
    key: "kie_api_key",
    label: "Kie.ai API key",
    help: "Used for Kie.ai video, image, and music generation. Find it at kie.ai → Dashboard → API Keys.",
    placeholder: "sk-...",
  },
  {
    key: "kie_default_video_model",
    label: "Kie.ai default video model",
    help: "Slug used when a Kie.ai video model is picked. Example: veo3.1.",
    placeholder: "veo3.1",
  },
  {
    key: "kie_default_image_model",
    label: "Kie.ai default image model",
    help: "Slug for cover-image generation. Example: flux-kontext.",
    placeholder: "flux-kontext",
  },
  {
    key: "kie_default_music_model",
    label: "Kie.ai default music model",
    help: "Suno token. Examples: V5, V4_5PLUS, V4_5, V4, V3_5.",
    placeholder: "V5",
  },
  {
    key: "pexels_api_key",
    label: "Pexels API key",
    help: "Free stock photos AND videos used as B-roll on the YouTube long-form generator. Get a key at pexels.com/api.",
    placeholder: "563492…",
  },
  {
    key: "unsplash_api_key",
    label: "Unsplash access key",
    help: "Adds Unsplash as an alternate B-roll image source. Photos only — Unsplash has no public video API. Create a free app at unsplash.com/developers and paste the Access Key.",
    placeholder: "Client-ID …",
  },
  {
    key: "anthropic_api_key",
    label: "Anthropic API key",
    help: "Used by 'Plan with Claude' on the YouTube page to split scripts into scenes and pick B-roll keywords. Get a key at console.anthropic.com.",
    placeholder: "sk-ant-…",
  },
  {
    key: "anthropic_default_model",
    label: "Anthropic default model",
    help: "Default Claude model for scene planning. Examples: claude-opus-4-7 (recommended), claude-sonnet-4-6 (cheaper), claude-haiku-4-5 (cheapest).",
    placeholder: "claude-opus-4-7",
  },
  {
    key: "google_api_key",
    label: "Google AI Studio API key",
    help: "Used by the ViMax page when calling Google Veo / Nano Banana directly (instead of via OpenRouter or Kie.ai). Get a key at aistudio.google.com.",
    placeholder: "AIza…",
  },
  {
    key: "openai_api_key",
    label: "OpenAI API key",
    help: "Optional. Used by the Agent's thumbnail step when the provider is set to OpenAI. Routes through gpt-image-1 (OpenAI retired DALL-E 3 on most accounts and now serves images via the GPT-4o image model). Get a key at platform.openai.com/api-keys.",
    placeholder: "sk-proj-…",
  },
  {
    key: "youtube_oauth_client_id",
    label: "YouTube OAuth client ID",
    help: "Used by the Publishing Agent on the Agent page. In Google Cloud Console, create a Web-Application OAuth client, enable the YouTube Data API v3, and add <your origin>/api/youtube/oauth/callback as an authorized redirect URI. Paste the client ID here.",
    placeholder: "1234-xxxx.apps.googleusercontent.com",
  },
  {
    key: "youtube_oauth_client_secret",
    label: "YouTube OAuth client secret",
    help: "Pair with the OAuth client ID above. Stored encrypted-at-rest only as much as your Postgres deployment is — keep it private.",
    placeholder: "GOCSPX-…",
  },
];

const SOURCE_BADGE: Record<SettingPublic["source"], { label: string; tone: string }> = {
  db: { label: "saved", tone: "text-success border-success/30 bg-success/10" },
  env: { label: "from env", tone: "text-amber-700 border-amber-700/30 bg-amber-100" },
  unset: { label: "not set", tone: "text-danger border-danger/30 bg-danger/10" },
};

export function SettingsForm({ initial }: { initial: SettingPublic[] }) {
  const [settings, setSettings] = useState<SettingPublic[]>(initial);
  const [drafts, setDrafts] = useState<Partial<Record<SettingKey, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (savedAt == null) return;
    const t = setTimeout(() => setSavedAt(null), 3000);
    return () => clearTimeout(t);
  }, [savedAt]);

  const dirty = Object.keys(drafts).length > 0;

  function update(key: SettingKey, value: string) {
    setDrafts((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const updates = Object.entries(drafts).map(([key, value]) => ({
        key: key as SettingKey,
        value: value === "" ? null : (value ?? null),
      }));
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const data = (await res.json()) as { settings?: SettingPublic[]; error?: string };
      if (!res.ok || !data.settings) throw new Error(data.error ?? `Failed (${res.status})`);
      setSettings(data.settings);
      setDrafts({});
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function clearKey(key: SettingKey) {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ updates: [{ key, value: null }] }),
      });
      const data = (await res.json()) as { settings?: SettingPublic[]; error?: string };
      if (!res.ok || !data.settings) throw new Error(data.error ?? `Failed (${res.status})`);
      setSettings(data.settings);
      setDrafts((d) => {
        const { [key]: _omit, ...rest } = d;
        return rest;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear");
    } finally {
      setSaving(false);
    }
  }

  function findSetting(key: SettingKey): SettingPublic {
    return settings.find((s) => s.key === key) ?? { key, hint: null, hasValue: false, source: "unset", secret: false };
  }

  return (
    <div className="space-y-6">
      <YouTubeConnectPanel />

      <div className="card p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Provider credentials</h2>
          <p className="text-sm text-muted mt-1">
            Saved to your Postgres database. Values from the database always win over environment
            variables. Existing keys are masked — paste a new value to overwrite, leave a field blank
            to keep the current one.
          </p>
        </div>

        <div className="space-y-5">
          {FIELDS.map((f) => {
            const s = findSetting(f.key);
            const draft = drafts[f.key];
            const badge = SOURCE_BADGE[s.source];
            return (
              <div key={f.key} className="space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <label className="text-sm font-semibold text-ink">{f.label}</label>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badge.tone}`}>
                      {badge.label}
                    </span>
                    {s.hint && (
                      <code className="text-xs text-muted bg-soft px-2 py-0.5 rounded">
                        {s.hint}
                      </code>
                    )}
                  </div>
                </div>
                <input
                  type={s.secret ? "password" : "text"}
                  className="input"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={s.hasValue ? "Leave blank to keep current" : f.placeholder}
                  value={draft ?? ""}
                  onChange={(e) => update(f.key, e.target.value)}
                />
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-muted">{f.help}</div>
                  {s.source === "db" && (
                    <button
                      type="button"
                      onClick={() => clearKey(f.key)}
                      disabled={saving}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Clear saved value
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 pt-2 border-t border-border">
          <button onClick={save} disabled={!dirty || saving} className="btn btn-primary">
            {saving ? "Saving…" : "Save changes"}
          </button>
          {savedAt && <div className="text-sm text-green-400">Saved.</div>}
          {error && <div className="text-sm text-red-400">{error}</div>}
        </div>
      </div>

      <div className="card p-6 text-sm text-muted space-y-2">
        <div className="font-semibold text-ink">Where are these stored?</div>
        <p>
          Each value is written to the <code className="text-ink">app_settings</code> table in
          your Postgres database. The Studio backend and the BullMQ worker both read from this table
          (with a 60-second in-process cache) before falling back to environment variables.
        </p>
        <p>
          API keys are never sent back to the browser — once saved, the API only returns the last
          four characters as a hint.
        </p>
      </div>
    </div>
  );
}

function YouTubeConnectPanel() {
  const [status, setStatus] = useState<{ connected: boolean; channelTitle: string | null } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/youtube/oauth/status");
      const data = (await res.json()) as { connected?: boolean; channelTitle?: string | null };
      setStatus({ connected: !!data.connected, channelTitle: data.channelTitle ?? null });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // Surface the redirect result from /api/youtube/oauth/callback.
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("yt_connected") === "1") {
      setFlash({ kind: "ok", text: "YouTube connected." });
    } else if (params.get("yt_error")) {
      setFlash({ kind: "err", text: params.get("yt_error") || "Connection failed." });
    }
    if (params.has("yt_connected") || params.has("yt_error")) {
      params.delete("yt_connected");
      params.delete("yt_error");
      const next =
        window.location.pathname + (params.toString() ? `?${params.toString()}` : "");
      window.history.replaceState(null, "", next);
    }
  }, []);

  async function disconnect() {
    if (!confirm("Disconnect this YouTube account from the Studio?")) return;
    setDisconnecting(true);
    try {
      await fetch("/api/youtube/oauth/disconnect", { method: "POST" });
      setFlash({ kind: "ok", text: "Disconnected." });
      await refresh();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="card p-6 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">YouTube channel</h2>
          <p className="text-sm text-muted mt-1">
            Connects a YouTube channel so the Publishing Agent on the{" "}
            <a href="/agent" className="underline hover:text-ink">Agent page</a>{" "}
            can upload, schedule, and add videos to playlists. Save the OAuth client ID + secret
            below first, then click Connect.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading ? (
            <span className="text-xs text-muted">Checking…</span>
          ) : status?.connected ? (
            <>
              <span className="text-xs px-2 py-0.5 rounded-full border text-success border-success/30 bg-success/10">
                Connected{status.channelTitle ? ` · ${status.channelTitle}` : ""}
              </span>
              <button
                onClick={disconnect}
                disabled={disconnecting}
                className="text-xs text-muted hover:text-danger underline disabled:opacity-50"
              >
                {disconnecting ? "Disconnecting…" : "Disconnect"}
              </button>
            </>
          ) : (
            <a href="/api/youtube/oauth/start" className="btn btn-primary text-sm">
              Connect YouTube
            </a>
          )}
        </div>
      </div>
      {flash && (
        <div
          className={`text-xs ${
            flash.kind === "ok" ? "text-success" : "text-danger"
          } whitespace-pre-wrap`}
        >
          {flash.text}
        </div>
      )}
      <div className="text-xs text-muted">
        End-screens are NOT exposed by the YouTube Data API — they have to be set in YouTube Studio
        after upload.
      </div>
    </div>
  );
}
