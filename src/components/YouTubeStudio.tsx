"use client";

import { useEffect, useMemo, useState } from "react";
import type { Job, Voice } from "@/lib/types";
import type { StockPhoto, StockProvider, StockVideo } from "@/lib/stock";
import { MUSIC_MODELS } from "@/lib/catalog";
import { parseScenes } from "@/lib/scenes";

type SelectedMedia =
  | { kind: "image"; photo: StockPhoto }
  | { kind: "video"; video: StockVideo };

type EditableScene = {
  id: string;
  text: string;
  keywords: string;
  selected?: SelectedMedia;
};

type SearchState = {
  sceneId: string;
  query: string;
  provider: StockProvider;
  kind: "image" | "video";
  loading: boolean;
  error?: string;
  photos: StockPhoto[];
  videos: StockVideo[];
};

const DEFAULT_SCRIPT = `Most people drink coffee on autopilot.

Here's why your morning routine matters more than you think.

Before you check your phone, your nervous system is already in its most receptive state.

What you consume in the first ten minutes sets your cortisol pattern for the entire day.

Reach for stillness instead. Three minutes of breathing, gratitude, or sunlight will reset your default mode.

Your morning is medicine.`;

export function YouTubeStudio() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [voicesError, setVoicesError] = useState<string | null>(null);

  const [title, setTitle] = useState("My YouTube long-form video");
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [scenes, setScenes] = useState<EditableScene[]>([]);

  const [generateMusic, setGenerateMusic] = useState(true);
  const [musicModelId, setMusicModelId] = useState(MUSIC_MODELS[0].id);
  const [musicPrompt, setMusicPrompt] = useState("");

  const [search, setSearch] = useState<SearchState | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  // Poll active job
  useEffect(() => {
    if (!job || job.status === "done" || job.status === "error") return;
    const id = job.id;
    const t = setInterval(async () => {
      const r = await fetch(`/api/jobs/${id}`);
      if (!r.ok) return;
      const data = (await r.json()) as { job: Job };
      setJob(data.job);
    }, 3000);
    return () => clearInterval(t);
  }, [job]);

  function parse() {
    const parsed = parseScenes(script);
    setScenes(
      parsed.map((s, i) => ({
        id: `scene-${Date.now()}-${i}`,
        text: s.text,
        keywords: s.keywords,
      })),
    );
  }

  async function planWithClaude() {
    setError(null);
    setPlanning(true);
    try {
      const res = await fetch("/api/youtube/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ script }),
      });
      const data = (await res.json()) as {
        title?: string;
        scenes?: Array<{ text: string; keywords: string; selected: StockPhoto | null }>;
        error?: string;
      };
      if (!res.ok || !data.scenes) throw new Error(data.error ?? `Failed (${res.status})`);
      if (data.title) setTitle(data.title);
      setScenes(
        data.scenes.map((s, i) => ({
          id: `scene-${Date.now()}-${i}`,
          text: s.text,
          keywords: s.keywords,
          selected: s.selected ? { kind: "image", photo: s.selected } : undefined,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claude scene planning failed");
    } finally {
      setPlanning(false);
    }
  }

  async function searchStock(
    scene: EditableScene,
    override?: { query?: string; provider?: StockProvider; kind?: "image" | "video" },
  ) {
    const prev = search?.sceneId === scene.id ? search : null;
    const query = (override?.query ?? prev?.query ?? scene.keywords).trim();
    const provider = override?.provider ?? prev?.provider ?? "pexels";
    const kind = override?.kind ?? prev?.kind ?? "image";
    if (!query) return;
    if (provider === "unsplash" && kind === "video") {
      setSearch({
        sceneId: scene.id,
        query,
        provider,
        kind,
        loading: false,
        photos: [],
        videos: [],
        error: "Unsplash has no video API. Pick Pexels for video.",
      });
      return;
    }
    setSearch({
      sceneId: scene.id,
      query,
      provider,
      kind,
      loading: true,
      photos: [],
      videos: [],
    });
    try {
      const params = new URLSearchParams({
        q: query,
        provider,
        kind,
        orientation: "landscape",
        perPage: "12",
      });
      const r = await fetch(`/api/stock/search?${params.toString()}`);
      const data = (await r.json()) as {
        kind?: "image" | "video";
        photos?: StockPhoto[];
        videos?: StockVideo[];
        error?: string;
      };
      if (!r.ok) throw new Error(data.error ?? `Failed (${r.status})`);
      setSearch({
        sceneId: scene.id,
        query,
        provider,
        kind,
        loading: false,
        photos: data.photos ?? [],
        videos: data.videos ?? [],
      });
    } catch (e) {
      setSearch({
        sceneId: scene.id,
        query,
        provider,
        kind,
        loading: false,
        photos: [],
        videos: [],
        error: e instanceof Error ? e.message : "Search failed",
      });
    }
  }

  function pickPhoto(scene: EditableScene, photo: StockPhoto) {
    setScenes((sc) =>
      sc.map((s) => (s.id === scene.id ? { ...s, selected: { kind: "image", photo } } : s)),
    );
    setSearch(null);
  }

  function pickVideo(scene: EditableScene, video: StockVideo) {
    setScenes((sc) =>
      sc.map((s) => (s.id === scene.id ? { ...s, selected: { kind: "video", video } } : s)),
    );
    setSearch(null);
  }

  function updateScene(id: string, patch: Partial<EditableScene>) {
    setScenes((sc) => sc.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function removeScene(id: string) {
    setScenes((sc) => sc.filter((s) => s.id !== id));
  }

  function addScene() {
    setScenes((sc) => [
      ...sc,
      { id: `scene-${Date.now()}`, text: "", keywords: "" },
    ]);
  }

  const ready = useMemo(
    () =>
      scenes.length > 0 &&
      scenes.every((s) => s.text.trim().length > 0 && s.selected) &&
      voiceId.length > 0 &&
      !submitting,
    [scenes, voiceId, submitting],
  );

  async function generate() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/youtube/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          voiceId,
          scenes: scenes.map((s) => {
            const sel = s.selected!;
            if (sel.kind === "video") {
              const v = sel.video;
              return {
                text: s.text,
                mediaType: "video" as const,
                videoUrl: v.url,
                imageUrl: v.thumbUrl,
                imageAttribution: `Video by ${v.photographer} on ${providerLabel(v.provider)}`,
              };
            }
            const p = sel.photo;
            return {
              text: s.text,
              mediaType: "image" as const,
              imageUrl: p.url,
              imageAttribution: `Photo by ${p.photographer} on ${providerLabel(p.provider)}`,
            };
          }),
          generateMusic,
          musicModelId: generateMusic ? musicModelId : undefined,
          musicPrompt: generateMusic ? musicPrompt || undefined : undefined,
          musicInstrumental: true,
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

  const missingScenes = scenes.length === 0;
  const missingImages = scenes.length > 0 && scenes.some((s) => !s.selected);

  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8">
      <section className="space-y-6">
        <div className="card p-6 space-y-5">
          <h2 className="text-xl font-semibold">Long-form script</h2>
          <div>
            <div className="label">Video title</div>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's this video about?"
            />
          </div>
          <div>
            <div className="label">Script</div>
            <textarea
              className="textarea min-h-[260px] resize-y"
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder={"Paste your full script here. Separate paragraphs with a blank line — each paragraph becomes a scene."}
            />
            <div className="text-xs text-muted mt-1">
              {script.length} chars · paragraphs become scenes (long ones auto-split on sentences).
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={planWithClaude}
              disabled={planning || script.trim().length < 20}
              className="btn btn-primary"
              title="Use Claude to split the script into scenes and auto-pick B-roll"
            >
              {planning ? "Planning…" : "Plan with Claude"}
            </button>
            <button onClick={parse} disabled={planning} className="btn btn-ghost">
              {scenes.length ? "Re-parse (offline)" : "Parse offline"}
            </button>
            {scenes.length > 0 && (
              <span className="text-sm text-muted">{scenes.length} scenes</span>
            )}
          </div>
          <div className="text-xs text-muted -mt-3">
            <strong className="text-muted">Plan with Claude</strong> uses the Anthropic API to
            split the script into scenes with strong visual keywords, then auto-picks a Pexels
            image per scene. You can swap any image afterward.{" "}
            <a href="/settings" className="underline hover:text-ink">Set your Anthropic key</a>
            .
          </div>
        </div>

        {scenes.length > 0 && (
          <div className="space-y-4">
            {scenes.map((scene, i) => (
              <SceneCard
                key={scene.id}
                index={i + 1}
                scene={scene}
                search={search?.sceneId === scene.id ? search : null}
                onSearch={searchStock}
                onPickPhoto={pickPhoto}
                onPickVideo={pickVideo}
                onUpdate={updateScene}
                onRemove={removeScene}
              />
            ))}
            <button onClick={addScene} className="btn btn-ghost w-full">
              + Add empty scene
            </button>
          </div>
        )}
      </section>

      <aside className="space-y-4">
        <div className="card p-6 space-y-5 sticky top-4">
          <h2 className="text-lg font-semibold">Output</h2>

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
            {voicesError && (
              <div className="text-xs text-red-400 mt-1">{voicesError}</div>
            )}
          </div>

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
                  placeholder="Optional: 'cinematic, ambient, warm strings'"
                />
              </div>
            )}
          </details>

          <div className="text-xs text-muted space-y-1">
            <div>Output: 1920×1080, ffmpeg slideshow.</div>
            <div>
              Cost = ElevenLabs chars × {scenes.length || "n"} scenes
              {generateMusic ? " + 1 Suno track" : ""}.
            </div>
          </div>

          <button onClick={generate} disabled={!ready} className="btn btn-primary w-full">
            {submitting ? "Starting…" : "Generate video"}
          </button>

          {missingScenes && (
            <div className="text-xs text-muted">
              Parse the script first, then pick a B-roll image for each scene.
            </div>
          )}
          {missingImages && (
            <div className="text-xs text-yellow-400">
              Some scenes still need a B-roll image. Click <em>Find B-roll</em> on each card.
            </div>
          )}
          {error && <div className="text-sm text-red-400">{error}</div>}
        </div>

        {job && <JobPanel job={job} />}
      </aside>
    </div>
  );
}

function providerLabel(p: StockProvider): string {
  return p === "unsplash" ? "Unsplash" : "Pexels";
}

function SceneCard({
  index,
  scene,
  search,
  onSearch,
  onPickPhoto,
  onPickVideo,
  onUpdate,
  onRemove,
}: {
  index: number;
  scene: EditableScene;
  search: SearchState | null;
  onSearch: (
    s: EditableScene,
    override?: { query?: string; provider?: StockProvider; kind?: "image" | "video" },
  ) => void;
  onPickPhoto: (s: EditableScene, p: StockPhoto) => void;
  onPickVideo: (s: EditableScene, v: StockVideo) => void;
  onUpdate: (id: string, patch: Partial<EditableScene>) => void;
  onRemove: (id: string) => void;
}) {
  const selected = scene.selected;
  const previewThumb = selected
    ? selected.kind === "image"
      ? selected.photo.thumbUrl
      : selected.video.thumbUrl
    : null;
  const previewAlt = selected && selected.kind === "image" ? selected.photo.alt ?? "" : "";
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
            className="textarea min-h-[100px] resize-y"
            value={scene.text}
            onChange={(e) => onUpdate(scene.id, { text: e.target.value })}
            placeholder="Narration for this scene…"
          />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              className="input"
              value={scene.keywords}
              onChange={(e) => onUpdate(scene.id, { keywords: e.target.value })}
              placeholder="Stock-photo keywords"
            />
            <button onClick={() => onSearch(scene)} className="btn btn-ghost whitespace-nowrap">
              Find B-roll
            </button>
          </div>
        </div>

        <div className="aspect-video bg-soft rounded-xl overflow-hidden border border-border flex items-center justify-center text-xs text-muted relative">
          {previewThumb ? (
            <>
              <img src={previewThumb} alt={previewAlt} className="w-full h-full object-cover" />
              {selected?.kind === "video" && (
                <span className="absolute bottom-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white">
                  ▶ video
                </span>
              )}
            </>
          ) : (
            "No B-roll yet"
          )}
        </div>
      </div>

      {search && (
        <div className="card p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted">
              {providerLabel(search.provider)} {search.kind === "video" ? "videos" : "photos"} for "{search.query}"
              {search.loading && " · loading…"}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex gap-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => onSearch(scene, { provider: "pexels" })}
                  className={`px-2 py-0.5 rounded ${search.provider === "pexels" ? "bg-accent/20 text-ink" : "bg-soft text-muted hover:text-ink"}`}
                >
                  Pexels
                </button>
                <button
                  type="button"
                  onClick={() => onSearch(scene, { provider: "unsplash", kind: "image" })}
                  className={`px-2 py-0.5 rounded ${search.provider === "unsplash" ? "bg-accent/20 text-ink" : "bg-soft text-muted hover:text-ink"}`}
                >
                  Unsplash
                </button>
              </div>
              <div className="flex gap-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => onSearch(scene, { kind: "image" })}
                  className={`px-2 py-0.5 rounded ${search.kind === "image" ? "bg-accent/20 text-ink" : "bg-soft text-muted hover:text-ink"}`}
                >
                  Photos
                </button>
                <button
                  type="button"
                  disabled={search.provider === "unsplash"}
                  onClick={() => onSearch(scene, { kind: "video" })}
                  className={`px-2 py-0.5 rounded disabled:opacity-40 disabled:cursor-not-allowed ${search.kind === "video" ? "bg-accent/20 text-ink" : "bg-soft text-muted hover:text-ink"}`}
                  title={search.provider === "unsplash" ? "Unsplash has no video API" : ""}
                >
                  Videos
                </button>
              </div>
              <input
                className="input !py-1 !px-2 text-xs"
                placeholder="Refine…"
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    onSearch(scene, { query: (e.target as HTMLInputElement).value });
                }}
              />
            </div>
          </div>
          {search.error && <div className="text-xs text-red-400">{search.error}</div>}
          {search.kind === "video" ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {search.videos.map((v) => (
                <button
                  key={v.id}
                  onClick={() => onPickVideo(scene, v)}
                  className="group aspect-video bg-soft rounded-lg overflow-hidden border border-transparent hover:border-accent transition relative"
                  title={`Video by ${v.photographer} on ${providerLabel(v.provider)}`}
                >
                  <img src={v.thumbUrl} alt="" className="w-full h-full object-cover group-hover:opacity-90" />
                  <span className="absolute bottom-1 right-1 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white">
                    {Math.round(v.durationSec)}s
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {search.photos.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onPickPhoto(scene, p)}
                  className="group aspect-video bg-soft rounded-lg overflow-hidden border border-transparent hover:border-accent transition"
                  title={`Photo by ${p.photographer} on ${providerLabel(p.provider)}`}
                >
                  <img
                    src={p.thumbUrl}
                    alt={p.alt ?? ""}
                    className="w-full h-full object-cover group-hover:opacity-90"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selected && (
        <div className="text-[11px] text-muted">
          {selected.kind === "video" ? "Video" : "Photo"} by{" "}
          <a
            className="underline hover:text-ink"
            href={
              (selected.kind === "image" ? selected.photo.photographerUrl : selected.video.photographerUrl) ??
              (selected.kind === "image" ? selected.photo.pageUrl : selected.video.pageUrl)
            }
            target="_blank"
            rel="noreferrer"
          >
            {selected.kind === "image" ? selected.photo.photographer : selected.video.photographer}
          </a>{" "}
          on{" "}
          <a
            className="underline hover:text-ink"
            href={selected.kind === "image" ? selected.photo.pageUrl : selected.video.pageUrl}
            target="_blank"
            rel="noreferrer"
          >
            {providerLabel(selected.kind === "image" ? selected.photo.provider : selected.video.provider)}
          </a>
        </div>
      )}
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
