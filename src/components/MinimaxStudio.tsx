"use client";

import { useEffect, useMemo, useState } from "react";
import type { Job, Platform } from "@/lib/types";

const MODELS: { id: string; label: string; hint: string; supportsImage: boolean }[] = [
  {
    id: "MiniMax-Hailuo-2.3",
    label: "Hailuo 2.3",
    hint: "Latest text-to-video. Best motion + prompt adherence.",
    supportsImage: false,
  },
  {
    id: "MiniMax-Hailuo-02",
    label: "Hailuo 02",
    hint: "Previous generation, supports text + image-to-video.",
    supportsImage: true,
  },
  {
    id: "I2V-01-Director",
    label: "I2V-01 Director",
    hint: "Image-to-video with director-style camera control hints.",
    supportsImage: true,
  },
  {
    id: "I2V-01-live",
    label: "I2V-01 Live",
    hint: "Image-to-video, fast turnaround.",
    supportsImage: true,
  },
];

const PLATFORMS: { id: Platform; label: string; aspect: string; hint: string }[] = [
  { id: "youtube", label: "YouTube", aspect: "16:9", hint: "Landscape · 1920×1080" },
  { id: "instagram", label: "Instagram", aspect: "9:16", hint: "Reels · 1080×1920" },
  { id: "tiktok", label: "TikTok", aspect: "9:16", hint: "Vertical · 1080×1920" },
  { id: "facebook", label: "Facebook", aspect: "16:9", hint: "Feed · 1920×1080" },
];

const DEFAULT_PROMPT =
  "A man picks up a book [Pedestal up], then reads [Static shot]. Warm window light, shallow depth of field.";

export function MinimaxStudio() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [modelId, setModelId] = useState(MODELS[0].id);
  const [platform, setPlatform] = useState<Platform>("youtube");
  const [resolution, setResolution] = useState<"768P" | "1080P">("1080P");
  const [duration, setDuration] = useState(6);
  const [firstFrame, setFirstFrame] = useState("");
  const [title, setTitle] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

  const model = useMemo(() => MODELS.find((m) => m.id === modelId)!, [modelId]);

  useEffect(() => {
    if (!job || job.status === "done" || job.status === "error") return;
    const id = job.id;
    const t = setInterval(async () => {
      const r = await fetch(`/api/jobs/${id}`);
      if (!r.ok) return;
      const d = (await r.json()) as { job: Job };
      setJob(d.job);
    }, 3000);
    return () => clearInterval(t);
  }, [job]);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch("/api/minimax/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          firstFrameImageUrl: model.supportsImage && firstFrame.trim() ? firstFrame.trim() : undefined,
          model: modelId,
          resolution,
          durationSec: duration,
          platform,
          title: title || undefined,
        }),
      });
      const d = (await r.json()) as { job?: Job; error?: string };
      if (!r.ok || !d.job) throw new Error(d.error ?? `Failed (${r.status})`);
      setJob(d.job);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8">
      <section className="card p-6 space-y-5">
        <h2 className="text-xl font-semibold">Prompt</h2>
        <div>
          <div className="label">Title (optional)</div>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Job label, e.g. 'Coffee shop b-roll'"
          />
        </div>
        <div>
          <div className="label">Prompt</div>
          <textarea
            className="textarea min-h-[140px] resize-y"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the shot. MiniMax accepts director cues in brackets, e.g. [Pedestal up], [Static shot]."
          />
          <div className="text-xs text-muted mt-1">{prompt.length} chars</div>
        </div>

        <div>
          <div className="label">Model</div>
          <select
            className="select"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {m.id}
              </option>
            ))}
          </select>
          <div className="text-xs text-muted mt-1">{model.hint}</div>
        </div>

        {model.supportsImage && (
          <div>
            <div className="label">First frame image (image-to-video, optional)</div>
            <input
              className="input"
              value={firstFrame}
              onChange={(e) => setFirstFrame(e.target.value)}
              placeholder="https://… (publicly accessible JPG/PNG)"
            />
            <div className="text-xs text-muted mt-1">
              Leave blank for pure text-to-video. When set, the clip animates outward from this
              still.
            </div>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <div className="label">Resolution</div>
            <select
              className="select"
              value={resolution}
              onChange={(e) => setResolution(e.target.value as "768P" | "1080P")}
            >
              <option value="1080P">1080P</option>
              <option value="768P">768P (faster)</option>
            </select>
          </div>
          <div>
            <div className="label">Duration (sec)</div>
            <input
              type="number"
              min={3}
              max={20}
              className="input"
              value={duration}
              onChange={(e) =>
                setDuration(Math.max(3, Math.min(20, Number(e.target.value) || 6)))
              }
            />
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="card p-6 space-y-5 sticky top-4">
          <h2 className="text-lg font-semibold">Target platform</h2>
          <div className="grid grid-cols-2 gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlatform(p.id)}
                className={`rounded-xl px-3 py-3 border text-left transition ${
                  platform === p.id
                    ? "border-accent bg-accent/10"
                    : "border-border hover:border-muted"
                }`}
              >
                <div className="text-sm font-semibold">{p.label}</div>
                <div className="text-[11px] text-muted">
                  {p.aspect} · {p.hint.split("·")[1]?.trim() ?? p.hint}
                </div>
              </button>
            ))}
          </div>

          <button
            onClick={submit}
            disabled={submitting || prompt.trim().length < 3}
            className="btn btn-primary w-full"
          >
            {submitting ? "Submitting…" : "Generate video"}
          </button>

          {error && <div className="text-sm text-red-400 whitespace-pre-wrap">{error}</div>}
        </div>

        {job && <JobPanel job={job} />}
      </aside>
    </div>
  );
}

function JobPanel({ job }: { job: Job }) {
  const terminal = job.status === "done" || job.status === "error";
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted">Job</div>
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
      {job.error && <div className="text-sm text-red-400 whitespace-pre-wrap">{job.error}</div>}
      {job.videoUrl && <video controls className="w-full rounded-lg bg-black" src={job.videoUrl} />}
    </div>
  );
}
