"use client";

import { useEffect, useMemo, useState } from "react";
import type { Job, Voice } from "@/lib/types";
import type { StockPhoto } from "@/lib/stock";
import { IMAGE_MODELS, MUSIC_MODELS } from "@/lib/catalog";
import { StylePicker } from "./StylePicker";

type Scene = {
  id: string;
  text: string;
  keywords: string;
  alt?: string;
  selected: StockPhoto | null;
};

const DEFAULT_IDEA =
  "A lone astronaut wakes up on Mars to find a single blue flower has bloomed inside her habitat — and she has to decide what to do.";

export function ViMaxStudio() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [voicesError, setVoicesError] = useState<string | null>(null);

  const [idea, setIdea] = useState(DEFAULT_IDEA);
  const [sceneCount, setSceneCount] = useState(6);
  const [imageModelId, setImageModelId] = useState(IMAGE_MODELS[0].id);
  const [styleId, setStyleId] = useState("cinematic");

  const [generateMusic, setGenerateMusic] = useState(true);
  const [musicModelId, setMusicModelId] = useState(MUSIC_MODELS[0].id);
  const [musicPrompt, setMusicPrompt] = useState("");

  const [title, setTitle] = useState("");
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [planning, setPlanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/voices")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `Failed (${r.status})`);
        return r.json() as Promise<{ voices: Voice[] }>;
      })
      .then((d) => {
        if (cancelled) return;
        setVoices(d.voices);
        if (d.voices[0]) setVoiceId(d.voices[0].id);
      })
      .catch((e: Error) => !cancelled && setVoicesError(e.message))
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
      const d = (await r.json()) as { job: Job };
      setJob(d.job);
    }, 3000);
    return () => clearInterval(t);
  }, [job]);

  async function plan() {
    setError(null);
    setPlanning(true);
    try {
      const r = await fetch("/api/vimax/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idea,
          sceneCount,
          imageModelId,
          styleId: styleId === "none" ? undefined : styleId,
        }),
      });
      const d = (await r.json()) as {
        title?: string;
        scenes?: Array<{ text: string; keywords: string; alt?: string; selected: StockPhoto | null }>;
        error?: string;
      };
      if (!r.ok || !d.scenes) throw new Error(d.error ?? `Failed (${r.status})`);
      if (d.title) setTitle(d.title);
      setScenes(
        d.scenes.map((s, i) => ({
          id: `s-${Date.now()}-${i}`,
          text: s.text,
          keywords: s.keywords,
          alt: s.alt,
          selected: s.selected,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Planning failed");
    } finally {
      setPlanning(false);
    }
  }

  function update(id: string, patch: Partial<Scene>) {
    setScenes((sc) => sc.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function remove(id: string) {
    setScenes((sc) => sc.filter((s) => s.id !== id));
  }

  const ready = useMemo(
    () =>
      !submitting &&
      scenes.length > 0 &&
      scenes.every((s) => s.text.trim() && s.selected) &&
      voiceId.length > 0,
    [scenes, voiceId, submitting],
  );

  async function generate() {
    setError(null);
    setSubmitting(true);
    try {
      const r = await fetch("/api/youtube/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          voiceId,
          scenes: scenes.map((s) => ({
            text: s.text,
            mediaType: "image",
            imageUrl: s.selected!.url,
            imageAttribution: s.selected!.alt ?? "AI generated",
          })),
          generateMusic,
          musicModelId: generateMusic ? musicModelId : undefined,
          musicPrompt: generateMusic ? musicPrompt || undefined : undefined,
          musicInstrumental: true,
          transitions: "crossfade",
          burnCaptions: false,
          colorGrade: "none",
          duckMusic: true,
          titleCard: { enabled: true, text: title, durationSec: 3 },
          outroCard: { enabled: false },
          styleId: styleId === "none" ? undefined : styleId,
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
      <section className="space-y-6">
        <div className="card p-6 space-y-5">
          <h2 className="text-xl font-semibold">Your idea</h2>
          <textarea
            className="textarea min-h-[140px] resize-y"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="A single concept, one or two sentences…"
          />
          <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <div className="label">Scenes</div>
              <input
                type="number"
                min={2}
                max={12}
                className="input"
                value={sceneCount}
                onChange={(e) =>
                  setSceneCount(Math.max(2, Math.min(12, Number(e.target.value) || 6)))
                }
              />
            </div>
            <button
              onClick={plan}
              disabled={planning || idea.trim().length < 5}
              className="btn btn-primary"
            >
              {planning ? "Planning + rendering…" : "Plan with ViMax"}
            </button>
          </div>
          <div className="text-xs text-muted -mt-2">
            Claude writes the storyboard, then your image model renders one frame per scene.
            Heads-up: image generation runs in parallel and can take 30–60s for 6 scenes.
          </div>
        </div>

        {scenes.length > 0 && (
          <div className="card p-4 space-y-2">
            <div className="label">Title</div>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        )}

        {scenes.length > 0 && (
          <div className="space-y-4">
            {scenes.map((s, i) => (
              <SceneCard
                key={s.id}
                index={i + 1}
                scene={s}
                onUpdate={update}
                onRemove={remove}
              />
            ))}
          </div>
        )}
      </section>

      <aside className="space-y-4">
        <div className="card p-6 space-y-5 sticky top-4">
          <h2 className="text-lg font-semibold">Render</h2>

          <div>
            <div className="label">Voice (ElevenLabs)</div>
            <select
              className="select"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              disabled={voicesLoading || voices.length === 0}
            >
              {voicesLoading && <option>Loading voices…</option>}
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.labels?.accent ? ` · ${v.labels.accent}` : ""}
                </option>
              ))}
            </select>
            {voicesError && <div className="text-xs text-red-400 mt-1">{voicesError}</div>}
          </div>

          <div>
            <div className="label">Image generator (Kie.ai)</div>
            <select
              className="select"
              value={imageModelId}
              onChange={(e) => setImageModelId(e.target.value)}
            >
              {IMAGE_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <div className="text-xs text-muted mt-1">
              {IMAGE_MODELS.find((m) => m.id === imageModelId)?.hint}
            </div>
          </div>

          <details className="card p-3" open>
            <summary className="cursor-pointer select-none text-sm font-semibold">
              Style preset
            </summary>
            <div className="mt-3">
              <StylePicker value={styleId} onChange={setStyleId} />
            </div>
          </details>

          <details className="card p-3" open={generateMusic}>
            <summary className="cursor-pointer select-none flex items-center gap-3">
              <input
                type="checkbox"
                checked={generateMusic}
                onChange={(e) => setGenerateMusic(e.target.checked)}
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-sm font-semibold">Background music</span>
            </summary>
            {generateMusic && (
              <div className="mt-3 space-y-3">
                <select
                  className="select"
                  value={musicModelId}
                  onChange={(e) => setMusicModelId(e.target.value)}
                >
                  {MUSIC_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  value={musicPrompt}
                  onChange={(e) => setMusicPrompt(e.target.value)}
                  placeholder="Optional: 'cinematic, epic, ambient'"
                />
              </div>
            )}
          </details>

          <button onClick={generate} disabled={!ready} className="btn btn-primary w-full">
            {submitting ? "Starting…" : "Generate video"}
          </button>

          {scenes.length === 0 && (
            <div className="text-xs text-muted">Plan with ViMax first.</div>
          )}
          {scenes.length > 0 && scenes.some((s) => !s.selected) && (
            <div className="text-xs text-yellow-400">
              Some scenes still need an image. Re-plan or paste a URL.
            </div>
          )}
          {error && <div className="text-sm text-red-400 whitespace-pre-wrap">{error}</div>}
        </div>

        {job && <JobPanel job={job} />}
      </aside>
    </div>
  );
}

function SceneCard({
  index,
  scene,
  onUpdate,
  onRemove,
}: {
  index: number;
  scene: Scene;
  onUpdate: (id: string, patch: Partial<Scene>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted">Scene {index}</div>
        <button onClick={() => onRemove(scene.id)} className="text-xs text-muted hover:text-red-400">
          Remove
        </button>
      </div>
      <div className="grid sm:grid-cols-[1fr_220px] gap-4">
        <div className="space-y-3">
          <textarea
            className="textarea min-h-[80px] resize-y"
            value={scene.text}
            onChange={(e) => onUpdate(scene.id, { text: e.target.value })}
          />
          <input
            className="input text-xs"
            value={scene.keywords}
            onChange={(e) => onUpdate(scene.id, { keywords: e.target.value })}
            placeholder="Visual prompt"
          />
        </div>
        <div className="aspect-video bg-soft rounded-xl overflow-hidden border border-border flex items-center justify-center text-xs text-muted">
          {scene.selected ? (
            <img
              src={scene.selected.thumbUrl}
              alt={scene.alt ?? ""}
              className="w-full h-full object-cover"
            />
          ) : (
            "No image"
          )}
        </div>
      </div>
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
      {job.musicUrl && (
        <div>
          <div className="label">Background music</div>
          <audio controls src={job.musicUrl} className="w-full" />
        </div>
      )}
    </div>
  );
}
