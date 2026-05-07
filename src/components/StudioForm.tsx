"use client";

import { useEffect, useMemo, useState } from "react";
import type { AspectRatio, Job, VideoModel, Voice } from "@/lib/types";

const ASPECTS: { value: AspectRatio; label: string; hint: string }[] = [
  { value: "9:16", label: "9:16", hint: "Reels · TikTok · Shorts" },
  { value: "1:1", label: "1:1", hint: "Instagram feed" },
  { value: "16:9", label: "16:9", hint: "YouTube · Facebook" },
];

const MODELS: { value: VideoModel; label: string; hint: string }[] = [
  { value: "seedance", label: "Seedance 2", hint: "ByteDance · fast, stylized" },
  { value: "veo", label: "Veo 3", hint: "Google · cinematic, native audio" },
];

export function StudioForm() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [voicesLoading, setVoicesLoading] = useState(true);

  const [script, setScript] = useState(
    "Three productivity hacks that changed my week. Number one: protect a single ninety-minute block every morning for deep work — no meetings, no Slack.",
  );
  const [voiceId, setVoiceId] = useState<string>("");
  const [videoModel, setVideoModel] = useState<VideoModel>("seedance");
  const [aspect, setAspect] = useState<AspectRatio>("9:16");
  const [avatar, setAvatar] = useState(true);
  const [visualPrompt, setVisualPrompt] = useState("");
  const [duration, setDuration] = useState(6);

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

  // Poll the active job until terminal.
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
    () => !submitting && script.trim().length > 0 && voiceId.length > 0,
    [submitting, script, voiceId],
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
          videoModel,
          aspect,
          avatar,
          visualPrompt: visualPrompt || undefined,
          durationSec: duration,
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
          <div className="text-xs text-[#6c7088] mt-1">{script.length} / 2000</div>
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
                {voicesError}. Set ELEVENLABS_API_KEY in .env to load voices.
              </div>
            )}
          </div>

          <div>
            <div className="label">Video model</div>
            <div className="grid grid-cols-2 gap-2">
              {MODELS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setVideoModel(m.value)}
                  className={`text-left rounded-xl px-3 py-2 border ${
                    videoModel === m.value
                      ? "border-accent bg-accent/10"
                      : "border-[#1f2030] hover:border-[#2a2c40]"
                  }`}
                >
                  <div className="text-sm font-semibold">{m.label}</div>
                  <div className="text-xs text-[#9aa0b4]">{m.hint}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

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
                    : "border-[#1f2030] hover:border-[#2a2c40]"
                }`}
              >
                <div className="text-sm font-semibold">{a.label}</div>
                <div className="text-[11px] text-[#9aa0b4]">{a.hint}</div>
              </button>
            ))}
          </div>
          <div className="text-xs text-[#6c7088] mt-2">
            We always render the other two ratios as well so you have one master per platform.
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <label className="flex items-start gap-3 card p-3 cursor-pointer select-none">
            <input
              type="checkbox"
              className="mt-1"
              checked={avatar}
              onChange={(e) => setAvatar(e.target.checked)}
            />
            <div>
              <div className="text-sm font-semibold">Talking-head avatar</div>
              <div className="text-xs text-[#9aa0b4]">
                Render an AI presenter lip-synced to the voiceover.
              </div>
            </div>
          </label>
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

        <div>
          <div className="label">Visual prompt (optional)</div>
          <input
            className="input"
            value={visualPrompt}
            onChange={(e) => setVisualPrompt(e.target.value)}
            placeholder="Override the auto-generated visual prompt…"
          />
        </div>

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

function JobPanel({ job }: { job: Job | null }) {
  if (!job) {
    return (
      <section className="card p-6 flex flex-col items-center justify-center text-center text-[#9aa0b4] min-h-[400px]">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-accent2 mb-4 opacity-80" />
        <div className="text-lg text-white font-semibold">Your reel will appear here</div>
        <div className="text-sm mt-1 max-w-xs">
          Pick a voice, write a script, and click <span className="text-white">Generate reel</span>. We'll
          synthesize the voice, generate the video clips and upload everything to your Cloudflare R2 bucket.
        </div>
      </section>
    );
  }
  const terminal = job.status === "done" || job.status === "error";
  return (
    <section className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-[#9aa0b4]">Job</div>
          <div className="font-mono text-xs text-[#c8cce0]">{job.id}</div>
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
          <div className="h-2 rounded-full bg-[#0e0f17] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent to-accent2 transition-all"
              style={{ width: `${job.progress}%` }}
            />
          </div>
          <div className="text-xs text-[#9aa0b4] mt-2">{job.message ?? "Working…"}</div>
        </div>
      )}

      {job.error && <div className="text-sm text-red-400">{job.error}</div>}

      {job.videoUrl && (
        <video controls className="w-full rounded-xl bg-black" src={job.videoUrl} />
      )}

      {job.audioUrl && (
        <div>
          <div className="label">Voiceover</div>
          <audio controls src={job.audioUrl} className="w-full" />
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
