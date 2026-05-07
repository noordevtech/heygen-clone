"use client";

import { useEffect, useState } from "react";

type SettingKey =
  | "openrouter_api_key"
  | "openrouter_seedance_model"
  | "openrouter_veo_model"
  | "elevenlabs_api_key"
  | "elevenlabs_default_model"
  | "kie_api_key"
  | "kie_default_video_model"
  | "kie_default_image_model"
  | "kie_default_music_model";

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
    help: "Slug for background-music generation. Example: suno-v5.",
    placeholder: "suno-v5",
  },
];

const SOURCE_BADGE: Record<SettingPublic["source"], { label: string; tone: string }> = {
  db: { label: "saved", tone: "text-green-400 border-green-400/30 bg-green-400/10" },
  env: { label: "from env", tone: "text-yellow-300 border-yellow-300/30 bg-yellow-300/10" },
  unset: { label: "not set", tone: "text-red-400 border-red-400/30 bg-red-400/10" },
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
      <div className="card p-6 space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Provider credentials</h2>
          <p className="text-sm text-[#9aa0b4] mt-1">
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
                  <label className="text-sm font-semibold text-white">{f.label}</label>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badge.tone}`}>
                      {badge.label}
                    </span>
                    {s.hint && (
                      <code className="text-xs text-[#9aa0b4] bg-[#0e0f17] px-2 py-0.5 rounded">
                        {s.hint}
                      </code>
                    )}
                  </div>
                </div>
                <input
                  type={f.key.includes("api_key") ? "password" : "text"}
                  className="input"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={s.hasValue ? "Leave blank to keep current" : f.placeholder}
                  value={draft ?? ""}
                  onChange={(e) => update(f.key, e.target.value)}
                />
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-[#6c7088]">{f.help}</div>
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

        <div className="flex items-center gap-3 pt-2 border-t border-[#1f2030]">
          <button onClick={save} disabled={!dirty || saving} className="btn btn-primary">
            {saving ? "Saving…" : "Save changes"}
          </button>
          {savedAt && <div className="text-sm text-green-400">Saved.</div>}
          {error && <div className="text-sm text-red-400">{error}</div>}
        </div>
      </div>

      <div className="card p-6 text-sm text-[#9aa0b4] space-y-2">
        <div className="font-semibold text-white">Where are these stored?</div>
        <p>
          Each value is written to the <code className="text-[#c8cce0]">app_settings</code> table in
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
