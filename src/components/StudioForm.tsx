"use client";

import { useEffect, useMemo, useState } from "react";
import type { AspectRatio, Job, Voice } from "@/lib/types";
import {
  VIDEO_MODELS,
  IMAGE_MODELS,
  MUSIC_MODELS,
  type VideoModelEntry,
  type ImageModelEntry,
  type MusicModelEntry,
} from "@/lib/catalog";

const ASPECTS: { value: AspectRatio; label: string; hint: string }[] = [
  { value: "9:16", label: "9:16", hint: "Reels · TikTok · Shorts" },
  { value: "1:1", label: "1:1", hint: "Instagram feed" },
  { value: "16:9", label: "16:9", hint: "YouTube · Facebook" },
];

export function StudioForm() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [voicesLoading, setVoicesLoading] = useState(true);

  const [script, setScript] = useState(
    "Three productivity hacks that changed my week. Number one: protect a single ninety-minute block every morning for deep work — no meetings, no Slack.",
  );
  const [voiceId, setVoiceId] = useState<string>("");
  const [videoModelId, setVideoModelId] = useState<string>(VIDEO_MODELS[0].id);
  const [aspect, setAspect] = useState<AspectRatio>("9:16");
  const [avatar, setAvatar] = useState(true);
  const [visualPrompt, setVisualPrompt] = useState("");
  const [duration, setDuration] = useState(6);

  const [generateImage, setGenerateImage] = useState(false);
  const [imageModelId, setImageModelId] = useState<string>(IMAGE_MODELS[0].id);
  const [imagePrompt, setImagePrompt] = useState("");

  const [generateMusic, setGenerateMusic] = useState(false);
  const [musicModelId, setMusicModelId] = useState<string>(MUSIC_MODELS[0].id);
  const [musicPrompt, setMusicPrompt] = useState("");
  const [musicInstrumental, setMusicInstrumental] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setVoicesLoading(true);
    fetch("/api/voices")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `Failed (${r.status})`);
        return r.json() as Promise<{ voices: Voice[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setVoices(data.voices);
        if (data.voices[0]) setVoiceId(data.voices[0].id);
      })
      .catch((e: Error) => {
        if (!cancelled) setVoicesError(e.message);
      })
      .finally(() => !cancelled && setVoicesLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!job || job.status === "done" || job.status === "error") return;
    const id = job.id;
    const t = setInterval(async () => {
      const r = await fetch(`/api/jobs/${id}`);
      if (!r.ok) return;
      const data = (await r.json()) as { job: Job };
      setJob(data.job);
    }, 2000);
    return () => clearInterval(t);
  }, [job]);

  const canSubmit = useMemo(
    () => !submitting && script.trim().length > 0 && voiceId.length > 0 && videoModelId.length > 0,
    [submitting, script, voiceId, videoModelId],
  );

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          script,
          voiceId,
          videoModelId,
          aspect,
          avatar,
          visualPrompt: visualPrompt || undefined,
          durationSec: duration,
          generateImage,
          imageModelId: generateImage ? imageModelId : undefined,
          imagePrompt: generateImage ? imagePrompt || undefined : undefined,
          generateMusic,
          musicModelId: generateMusic ? musicModelId : undefined,
          musicPrompt: generateMusic ? musicPrompt || undefined : undefined,
          musicInstrumental: generateMusic ? musicInstrumental : undefined,
        }),
      });
      const data = (await res.json()) as { job?: Job; error?: string };
      if (!res.ok || !data.job) throw new Error(data.error ?? `Failed (${res.status})`);
      setJob(data.job);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start generation");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-[1.1fr_1fr] gap-8">
      <section className="card p-6 space-y-5">
        <h2 className="text-xl font-semibold">Create a reel</h2>

        <div>
          <div className="label">Script</div>
          <textarea
            className="textarea min-h-[140px] resize-y"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="Write what your presenter will say…"
          />
          <div className="text-xs text-muted mt-1">{script.length} / 2000</div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <div className="label">Voice (ElevenLabs)</div>
            <select
              className="select"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              disabled={voicesLoading || voices.length === 0}
            >
              {voicesLoading && <option>Loading voices…</option>}
              {!voicesLoading && voices.length === 0 && <option>No voices available</option>}
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.labels?.accent ? ` · ${v.labels.accent}` : ""}
                </option>
              ))}
            </select>
            {voicesError && (
              <div className="text-xs text-red-400 mt-1">
                {voicesError}. Set the ElevenLabs API key on the Settings page.
              </div>
            )}
          </div>

          <div>
            <div className="label">Clip duration (sec)</div>
            <input
              type="number"
              min={2}
              max={20}
              className="input"
              value={duration}
              onChange={(e) => setDuration(Math.max(2, Math.min(20, Number(e.target.value) || 6)))}
            />
          </div>
        </div>

        <ModelSelect<VideoModelEntry>
          label="Video model"
          help="The clip generator. OpenRouter and Kie.ai routes are both supported."
          options={VIDEO_MODELS}
          value={videoModelId}
          onChange={setVideoModelId}
        />

        <div>
          <div className="label">Primary aspect ratio</div>
          <div className="grid grid-cols-3 gap-2">
            {ASPECTS.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => setAspect(a.value)}
                className={`rounded-xl px-3 py-2 border ${
                  aspect === a.value
                    ? "border-accent bg-accent/10"
                    : "border-border hover:border-muted"
                }`}
              >
                <div className="text-sm font-semibold">{a.label}</div>
                <div className="text-[11px] text-muted">{a.hint}</div>
              </button>
            ))}
          </div>
          <div className="text-xs text-muted mt-2">
            Other supported aspects render in parallel for one master per platform.
          </div>
        </div>

        <label className="flex items-start gap-3 card p-3 cursor-pointer select-none">
          <input
            type="checkbox"
            className="mt-1"
            checked={avatar}
            onChange={(e) => setAvatar(e.target.checked)}
          />
          <div>
            <div className="text-sm font-semibold">Talking-head avatar</div>
            <div className="text-xs text-muted">
              Render an AI presenter lip-synced to the voiceover (uses native audio on Veo / Seedance 1.5+).
            </div>
          </div>
        </label>

        <div>
          <div className="label">Visual prompt (optional)</div>
          <input
            className="input"
            value={visualPrompt}
            onChange={(e) => setVisualPrompt(e.target.value)}
            placeholder="Override the auto-generated visual prompt…"
          />
        </div>

        <details className="card p-4" open={generateImage}>
          <summary className="cursor-pointer select-none flex items-center gap-3">
            <input
              type="checkbox"
              checked={generateImage}
              onChange={(e) => setGenerateImage(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
            />
            <span className="text-sm font-semibold">Generate cover image</span>
            <span className="text-xs text-muted">
              Optional thumbnail/poster via Kie.ai image models.
            </span>
          </summary>
          {generateImage && (
            <div className="space-y-3 mt-4">
              <ModelSelect<ImageModelEntry>
                label="Image model"
                help="Choose a Kie.ai image model. Defaults pick a balanced photoreal option."
                options={IMAGE_MODELS}
                value={imageModelId}
                onChange={setImageModelId}
                inline
              />
              <div>
                <div className="label">Image prompt (optional)</div>
                <input
                  className="input"
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder="Override the auto-generated image prompt…"
                />
              </div>
            </div>
          )}
        </details>

        <details className="card p-4" open={generateMusic}>
          <summary className="cursor-pointer select-none flex items-center gap-3">
            <input
              type="checkbox"
              checked={generateMusic}
              onChange={(e) => setGenerateMusic(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
            />
            <span className="text-sm font-semibold">Generate background music</span>
            <span className="text-xs text-muted">
              Optional soundtrack via Kie.ai Suno.
            </span>
          </summary>
          {generateMusic && (
            <div className="space-y-3 mt-4">
              <ModelSelect<MusicModelEntry>
                label="Music model"
                help="Pick a Suno version. Higher versions sound better but cost more."
                options={MUSIC_MODELS}
                value={musicModelId}
                onChange={setMusicModelId}
                inline
              />
              <div className="flex items-center gap-3">
                <input
                  id="instrumental"
                  type="checkbox"
                  checked={musicInstrumental}
                  onChange={(e) => setMusicInstrumental(e.target.checked)}
                />
                <label htmlFor="instrumental" className="text-sm select-none">
                  Instrumental only (no lyrics)
                </label>
              </div>
              <div>
                <div className="label">Music prompt (optional)</div>
                <input
                  className="input"
                  value={musicPrompt}
                  onChange={(e) => setMusicPrompt(e.target.value)}
                  placeholder="Lo-fi upbeat, warm pads, gentle percussion…"
                />
              </div>
            </div>
          )}
        </details>

        <div className="flex items-center gap-3">
          <button onClick={submit} disabled={!canSubmit} className="btn btn-primary">
            {submitting ? "Starting…" : "Generate reel"}
          </button>
          {error && <div className="text-sm text-red-400">{error}</div>}
        </div>
      </section>

      <JobPanel job={job} />
    </div>
  );
}

type CatalogEntry = { id: string; label: string; hint: string; provider: string };

function ModelSelect<T extends CatalogEntry>({
  label,
  help,
  options,
  value,
  onChange,
  inline,
}: {
  label: string;
  help: string;
  options: T[];
  value: string;
  onChange: (id: string) => void;
  inline?: boolean;
}) {
  const selected = options.find((o) => o.id === value);
  return (
    <div>
      <div className="label flex items-center justify-between">
        <span>{label}</span>
        {selected && (
          <span className="chip text-[10px] uppercase" style={{ letterSpacing: "0.06em" }}>
            {selected.provider}
          </span>
        )}
      </div>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="text-xs text-muted mt-1">
        {selected?.hint ?? help}
        {!inline && (
          <>
            {" "}
            <a href="/settings" className="underline hover:text-ink">
              Configure provider keys
            </a>
            .
          </>
        )}
      </div>
    </div>
  );
}

function JobPanel({ job }: { job: Job | null }) {
  if (!job) {
    return (
      <section className="card p-6 flex flex-col items-center justify-center text-center text-muted min-h-[400px]">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-accent2 mb-4 opacity-80" />
        <div className="text-lg text-ink font-semibold">Your reel will appear here</div>
        <div className="text-sm mt-1 max-w-xs">
          Pick a voice, write a script, choose a video model and click{" "}
          <span className="text-ink">Generate reel</span>. Optional cover image and background
          music run in parallel after the clips finish.
        </div>
      </section>
    );
  }
  const terminal = job.status === "done" || job.status === "error";
  return (
    <section className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted">Job</div>
          <div className="font-mono text-xs text-ink">{job.id}</div>
        </div>
        <span className="chip">
          <span
            className={`w-2 h-2 rounded-full ${
              job.status === "done"
                ? "bg-green-400"
                : job.status === "error"
                  ? "bg-red-400"
                  : "bg-yellow-400 animate-pulse"
            }`}
          />
          {job.status}
        </span>
      </div>

      {!terminal && (
        <div>
          <div className="h-2 rounded-full bg-soft overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent to-accent2 transition-all"
              style={{ width: `${job.progress}%` }}
            />
          </div>
          <div className="text-xs text-muted mt-2">{job.message ?? "Working…"}</div>
        </div>
      )}

      {job.error && <div className="text-sm text-red-400">{job.error}</div>}

      {job.thumbnailUrl && (
        <img
          src={job.thumbnailUrl}
          alt="Cover"
          className="w-full rounded-xl bg-black"
        />
      )}

      {job.videoUrl && <video controls className="w-full rounded-xl bg-black" src={job.videoUrl} />}

      {job.audioUrl && (
        <div>
          <div className="label">Voiceover</div>
          <audio controls src={job.audioUrl} className="w-full" />
        </div>
      )}

      {job.musicUrl && (
        <div>
          <div className="label">Background music</div>
          <audio controls src={job.musicUrl} className="w-full" />
        </div>
      )}

      {job.variants && Object.keys(job.variants).length > 0 && (
        <div>
          <div className="label">Downloads</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(job.variants).map(([aspect, url]) =>
              url ? (
                <a key={aspect} className="chip hover:border-accent" href={url} download>
                  {aspect}
                </a>
              ) : null,
            )}
          </div>
        </div>
      )}
    </section>
  );
}
