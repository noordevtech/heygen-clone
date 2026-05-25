"use client";

import { useEffect, useMemo, useState } from "react";
import type { Job, Voice } from "@/lib/types";
import type { StockPhoto } from "@/lib/stock";
import { MUSIC_MODELS, IMAGE_MODELS } from "@/lib/catalog";
import { StylePicker } from "./StylePicker";

type Aspect = "9:16" | "1:1" | "16:9";

type PlannedScene = {
  text: string;
  keywords: string;
  alt?: string;
  selected: StockPhoto | null;
};

const STEPS = ["Script", "Template", "Customization", "Review"] as const;
type StepIndex = 0 | 1 | 2 | 3 | 4;

const ASPECT_OPTIONS: {
  value: Aspect;
  label: string;
  hint: string;
  pixels: { w: number; h: number };
}[] = [
  { value: "9:16", label: "9:16 (portrait)", hint: "TikTok · Reels · Shorts", pixels: { w: 1080, h: 1920 } },
  { value: "1:1", label: "1:1 (square)", hint: "Instagram feed", pixels: { w: 1080, h: 1080 } },
  { value: "16:9", label: "16:9 (landscape)", hint: "YouTube · Facebook", pixels: { w: 1920, h: 1080 } },
];

const COLOR_GRADES: { value: "none" | "cinematic" | "warm" | "cool" | "bw"; label: string }[] = [
  { value: "none", label: "None" },
  { value: "cinematic", label: "Cinematic" },
  { value: "warm", label: "Warm" },
  { value: "cool", label: "Cool" },
  { value: "bw", label: "Black & White" },
];

const DEFAULT_SCRIPT = `Most people drink coffee on autopilot.

Here's why your morning routine matters more than you think.

Before you check your phone, your nervous system is already in its most receptive state.

What you consume in the first ten minutes sets your cortisol pattern for the entire day.

Reach for stillness instead. Three minutes of breathing, gratitude, or sunlight will reset your default mode.

Your morning is medicine.`;

export function YouTubeWizard() {
  // Wizard state
  const [step, setStep] = useState<StepIndex>(0);

  // Step 1
  const [title, setTitle] = useState("My YouTube long-form video");
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [refining, setRefining] = useState(false);
  const [refineSummary, setRefineSummary] = useState<string | null>(null);

  // Step 2
  const [aspect, setAspect] = useState<Aspect>("16:9");
  const [styleId, setStyleId] = useState<string>("none");

  // Step 3
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [voicesError, setVoicesError] = useState<string | null>(null);

  const [imageSource, setImageSource] = useState<"pexels" | "ai">("ai");
  const [imageModelId, setImageModelId] = useState<string>("kie:z-image-turbo");

  const [burnCaptions, setBurnCaptions] = useState(false);
  const [transitions, setTransitions] = useState<"none" | "crossfade">("crossfade");
  const [colorGrade, setColorGrade] = useState<"none" | "cinematic" | "warm" | "cool" | "bw">(
    "cinematic",
  );

  const [generateMusic, setGenerateMusic] = useState(false);
  const [musicModelId, setMusicModelId] = useState(MUSIC_MODELS[0].id);
  const [musicPrompt, setMusicPrompt] = useState("");
  const [duckMusic, setDuckMusic] = useState(true);
  const [scenePauseSec, setScenePauseSec] = useState(1.0);

  const [titleCardEnabled, setTitleCardEnabled] = useState(true);
  const [outroCardEnabled, setOutroCardEnabled] = useState(false);
  const [outroCardText, setOutroCardText] = useState("Thanks for watching");

  // Step 4
  const [planning, setPlanning] = useState(false);
  const [scenes, setScenes] = useState<PlannedScene[]>([]);

  // Step 5
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<Job | null>(null);

  const [error, setError] = useState<string | null>(null);

  // Consume one-shot prefill from /agent → /youtube hand-off. Stored under
  // `youtubeWizardPrefill` by AgentWorkflow before navigating here.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem("youtubeWizardPrefill");
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as { script?: string; title?: string };
      if (data.script && data.script.trim().length > 20) setScript(data.script);
      if (data.title && data.title.trim().length > 0) setTitle(data.title);
    } catch {
      /* ignore — bad payload */
    }
    sessionStorage.removeItem("youtubeWizardPrefill");
  }, []);

  // Load voices once
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

  function next() {
    setError(null);
    setStep((s) => (Math.min(4, s + 1) as StepIndex));
  }
  function back() {
    setError(null);
    setStep((s) => (Math.max(0, s - 1) as StepIndex));
  }

  const canAdvance: Record<StepIndex, boolean> = {
    0: script.trim().length >= 20 && title.trim().length > 0,
    1: !!aspect,
    2: voiceId.length > 0,
    3: scenes.length > 0,
    4: false,
  };

  async function refine() {
    if (!refineInstruction.trim()) return;
    setRefining(true);
    setError(null);
    try {
      const res = await fetch("/api/youtube/refine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ script, instruction: refineInstruction.trim() }),
      });
      const data = (await res.json()) as { script?: string; summary?: string; error?: string };
      if (!res.ok || !data.script) throw new Error(data.error ?? `Failed (${res.status})`);
      setScript(data.script);
      setRefineSummary(data.summary ?? null);
      setRefineInstruction("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refine failed");
    } finally {
      setRefining(false);
    }
  }

  async function planScenes() {
    setError(null);
    setPlanning(true);
    try {
      const res = await fetch("/api/youtube/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          script,
          imageSource,
          imageModelId: imageSource === "ai" ? imageModelId : undefined,
          styleId,
          aspect,
        }),
      });
      const data = (await res.json()) as {
        title?: string;
        scenes?: PlannedScene[];
        error?: string;
      };
      if (!res.ok || !data.scenes) throw new Error(data.error ?? `Failed (${res.status})`);
      if (data.title) setTitle(data.title);
      setScenes(data.scenes);
      // /api/youtube/plan deliberately returns scenes without images for
      // BOTH sources so per-scene progress and retry work uniformly.
      void renderAllImages(data.scenes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scene planning failed");
    } finally {
      setPlanning(false);
    }
  }

  /** Per-scene loading + error state for image rendering (both sources). */
  const [imageState, setImageState] = useState<
    Record<number, "loading" | "done" | { error: string }>
  >({});

  async function renderAllImages(initial: PlannedScene[]) {
    setImageState({});
    const CONCURRENCY = imageSource === "ai" ? 4 : 8;
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(CONCURRENCY, initial.length) },
      () =>
        (async () => {
          while (true) {
            const idx = cursor++;
            if (idx >= initial.length) return;
            await renderOneImage(idx, initial[idx]);
          }
        })(),
    );
    await Promise.all(workers);
  }

  async function renderOneImage(idx: number, scene: PlannedScene) {
    setImageState((m) => ({ ...m, [idx]: "loading" }));
    try {
      let selected: StockPhoto | null = null;
      if (imageSource === "ai") {
        const res = await fetch("/api/youtube/image", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            imageModelId,
            styleId,
            aspect,
            keywords: scene.keywords,
            alt: scene.alt,
          }),
        });
        const data = (await res.json()) as { selected?: StockPhoto; error?: string };
        if (!res.ok || !data.selected) {
          throw new Error(data.error ?? `Failed (${res.status})`);
        }
        selected = data.selected;
      } else {
        const orientation =
          aspect === "9:16" ? "portrait" : aspect === "1:1" ? "square" : "landscape";
        const url = `/api/stock/search?q=${encodeURIComponent(scene.keywords)}&orientation=${orientation}&perPage=1&kind=image&provider=pexels`;
        const res = await fetch(url);
        const data = (await res.json()) as { photos?: StockPhoto[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
        selected = data.photos?.[0] ?? null;
        if (!selected) {
          throw new Error(`No Pexels result for "${scene.keywords}"`);
        }
      }
      setScenes((prev) =>
        prev.map((s, i) => (i === idx ? { ...s, selected } : s)),
      );
      setImageState((m) => ({ ...m, [idx]: "done" }));
    } catch (e) {
      setImageState((m) => ({
        ...m,
        [idx]: { error: e instanceof Error ? e.message : "Render failed" },
      }));
    }
  }

  function retryScene(idx: number) {
    const s = scenes[idx];
    if (!s) return;
    void renderOneImage(idx, s);
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const aspectMeta = ASPECT_OPTIONS.find((a) => a.value === aspect)!;
      const usable = scenes.filter((s) => !!s.selected);
      if (usable.length === 0) {
        throw new Error("No scenes have an image yet. Re-plan or pick images on the Review step.");
      }
      const res = await fetch("/api/youtube/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          voiceId,
          width: aspectMeta.pixels.w,
          height: aspectMeta.pixels.h,
          styleId,
          transitions,
          burnCaptions,
          colorGrade,
          duckMusic,
          scenePauseSec,
          titleCard: { enabled: titleCardEnabled, text: title },
          outroCard: outroCardEnabled
            ? { enabled: true, text: outroCardText }
            : { enabled: false },
          scenes: usable.map((s) => ({
            text: s.text,
            imageUrl: s.selected!.url,
            imageAttribution: `Photo by ${s.selected!.photographer} on ${
              s.selected!.provider === "ai" ? "AI" : "Pexels"
            }`,
          })),
          generateMusic,
          musicModelId: generateMusic ? musicModelId : undefined,
          musicPrompt: generateMusic ? musicPrompt || undefined : undefined,
          musicInstrumental: true,
        }),
      });
      const data = (await res.json()) as {
        job?: Job;
        error?: string;
        issues?: Array<{ path?: (string | number)[]; message?: string }>;
      };
      if (!res.ok || !data.job) {
        // Surface Zod validation issues if present, e.g. "scenes must be at
        // most 300" — the generic "Invalid request" alone tells the user
        // nothing.
        const detail = data.issues
          ?.map((i) => `${i.path?.join(".") ?? "(root)"}: ${i.message ?? "invalid"}`)
          .join("; ");
        throw new Error(
          [data.error ?? `Failed (${res.status})`, detail].filter(Boolean).join(" — "),
        );
      }
      setJob(data.job);
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start generation");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-accent">Script to video</h1>
      </div>

      <Stepper step={step} />

      <div className="mt-8">
        {step === 0 && (
          <Step1Script
            title={title}
            setTitle={setTitle}
            script={script}
            setScript={setScript}
            instruction={refineInstruction}
            setInstruction={setRefineInstruction}
            refining={refining}
            onRefine={refine}
            refineSummary={refineSummary}
          />
        )}
        {step === 1 && (
          <Step2Template
            aspect={aspect}
            setAspect={setAspect}
            styleId={styleId}
            setStyleId={setStyleId}
          />
        )}
        {step === 2 && (
          <Step3Customize
            voices={voices}
            voicesLoading={voicesLoading}
            voicesError={voicesError}
            voiceId={voiceId}
            setVoiceId={setVoiceId}
            imageSource={imageSource}
            setImageSource={setImageSource}
            imageModelId={imageModelId}
            setImageModelId={setImageModelId}
            burnCaptions={burnCaptions}
            setBurnCaptions={setBurnCaptions}
            transitions={transitions}
            setTransitions={setTransitions}
            colorGrade={colorGrade}
            setColorGrade={setColorGrade}
            generateMusic={generateMusic}
            setGenerateMusic={setGenerateMusic}
            musicModelId={musicModelId}
            setMusicModelId={setMusicModelId}
            musicPrompt={musicPrompt}
            setMusicPrompt={setMusicPrompt}
            duckMusic={duckMusic}
            setDuckMusic={setDuckMusic}
            scenePauseSec={scenePauseSec}
            setScenePauseSec={setScenePauseSec}
            titleCardEnabled={titleCardEnabled}
            setTitleCardEnabled={setTitleCardEnabled}
            outroCardEnabled={outroCardEnabled}
            setOutroCardEnabled={setOutroCardEnabled}
            outroCardText={outroCardText}
            setOutroCardText={setOutroCardText}
          />
        )}
        {step === 3 && (
          <Step4Review
            planning={planning}
            scenes={scenes}
            onPlan={planScenes}
            onScenesChange={setScenes}
            aspect={aspect}
            imageSource={imageSource}
            imageState={imageState}
            onRetry={retryScene}
          />
        )}
        {step === 4 && <Step5Result job={job} scenes={scenes} aspect={aspect} title={title} />}
      </div>

      {error && (
        <div className="mt-4 text-sm text-danger whitespace-pre-wrap">{error}</div>
      )}

      <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            if (step === 0) {
              if (confirm("Cancel and discard wizard state?")) {
                window.location.reload();
              }
            } else {
              back();
            }
          }}
        >
          {step === 0 ? "Cancel" : "Back"}
        </button>
        <div className="text-xs text-muted">
          Step {Math.min(step + 1, 4)} / 4
        </div>
        {step < 3 && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canAdvance[step]}
            onClick={next}
          >
            Next →
          </button>
        )}
        {step === 3 && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canAdvance[3] || submitting}
            onClick={submit}
          >
            {submitting ? "Submitting…" : "Generate video"}
          </button>
        )}
        {step === 4 && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setStep(0);
              setJob(null);
              setScenes([]);
            }}
          >
            New video
          </button>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Stepper
// ----------------------------------------------------------------------------

function Stepper({ step }: { step: StepIndex }) {
  return (
    <ol className="flex items-center w-full max-w-3xl mx-auto">
      {STEPS.map((label, i) => {
        const active = i === step;
        const done = i < step;
        return (
          <li key={label} className="flex-1 flex flex-col items-center relative">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors ${
                active
                  ? "border-accent text-accent bg-white"
                  : done
                    ? "border-accent bg-accent text-white"
                    : "border-border text-muted bg-white"
              }`}
            >
              {i + 1}
            </div>
            <div
              className={`mt-1.5 text-[11px] uppercase tracking-wide ${
                active ? "text-accent font-semibold" : "text-muted"
              }`}
            >
              {label}
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`absolute top-4 left-[calc(50%+1rem)] right-[calc(-50%+1rem)] h-px ${
                  done ? "bg-accent" : "bg-border"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ----------------------------------------------------------------------------
// Step 1 — Script
// ----------------------------------------------------------------------------

function Step1Script({
  title,
  setTitle,
  script,
  setScript,
  instruction,
  setInstruction,
  refining,
  onRefine,
  refineSummary,
}: {
  title: string;
  setTitle: (v: string) => void;
  script: string;
  setScript: (v: string) => void;
  instruction: string;
  setInstruction: (v: string) => void;
  refining: boolean;
  onRefine: () => void;
  refineSummary: string | null;
}) {
  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <div>
        <div className="label">Video title</div>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div>
        <div className="label">Script</div>
        <textarea
          className="textarea min-h-[280px] resize-y"
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="Paste the full narration. Paragraphs become scenes."
        />
        <div className="text-xs text-muted mt-1">
          {script.length} chars · paragraphs become scenes (long ones auto-split on sentences).
        </div>
      </div>

      <div>
        <div className="label">Improve with Claude (optional)</div>
        <div className="card p-3 space-y-2 bg-soft">
          <textarea
            className="textarea min-h-[72px] resize-y bg-white"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Eg: Make the hook more intriguing and add a call to action at the end."
          />
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted">
              Sends your script + instruction to Claude. The result replaces your script.
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={refining || instruction.trim().length < 3 || script.trim().length < 20}
              onClick={onRefine}
            >
              {refining ? "Rewriting…" : "Apply ✦"}
            </button>
          </div>
          {refineSummary && (
            <div className="text-xs text-success">Last revision: {refineSummary}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Step 2 — Template & size
// ----------------------------------------------------------------------------

function Step2Template({
  aspect,
  setAspect,
  styleId,
  setStyleId,
}: {
  aspect: Aspect;
  setAspect: (v: Aspect) => void;
  styleId: string;
  setStyleId: (v: string) => void;
}) {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <div className="label">Size (aspect ratio)</div>
        <div className="grid grid-cols-3 gap-3">
          {ASPECT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setAspect(o.value)}
              className={`rounded-full px-4 py-2.5 border text-sm transition ${
                aspect === o.value
                  ? "border-accent bg-accent/10 text-accent font-semibold"
                  : "border-border hover:border-muted text-ink bg-white"
              }`}
              title={o.hint}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <StylePicker value={styleId} onChange={setStyleId} />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Step 3 — Customization
// ----------------------------------------------------------------------------

function Step3Customize(props: {
  voices: Voice[];
  voicesLoading: boolean;
  voicesError: string | null;
  voiceId: string;
  setVoiceId: (v: string) => void;
  imageSource: "pexels" | "ai";
  setImageSource: (v: "pexels" | "ai") => void;
  imageModelId: string;
  setImageModelId: (v: string) => void;
  burnCaptions: boolean;
  setBurnCaptions: (v: boolean) => void;
  transitions: "none" | "crossfade";
  setTransitions: (v: "none" | "crossfade") => void;
  colorGrade: "none" | "cinematic" | "warm" | "cool" | "bw";
  setColorGrade: (v: "none" | "cinematic" | "warm" | "cool" | "bw") => void;
  generateMusic: boolean;
  setGenerateMusic: (v: boolean) => void;
  musicModelId: string;
  setMusicModelId: (v: string) => void;
  musicPrompt: string;
  setMusicPrompt: (v: string) => void;
  duckMusic: boolean;
  setDuckMusic: (v: boolean) => void;
  scenePauseSec: number;
  setScenePauseSec: (v: number) => void;
  titleCardEnabled: boolean;
  setTitleCardEnabled: (v: boolean) => void;
  outroCardEnabled: boolean;
  setOutroCardEnabled: (v: boolean) => void;
  outroCardText: string;
  setOutroCardText: (v: string) => void;
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-4 max-w-4xl mx-auto">
      <CustomCard
        title="Voiceover"
        subtitle="The voice that reads your script (ElevenLabs)."
        active={!!props.voiceId}
      >
        <select
          className="select"
          value={props.voiceId}
          onChange={(e) => props.setVoiceId(e.target.value)}
          disabled={props.voicesLoading || props.voices.length === 0}
        >
          {props.voicesLoading && <option>Loading voices…</option>}
          {props.voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
              {v.labels?.accent ? ` · ${v.labels.accent}` : ""}
            </option>
          ))}
        </select>
        {props.voicesError && (
          <div className="text-xs text-danger mt-1">{props.voicesError}</div>
        )}
      </CustomCard>

      <CustomCard
        title={props.imageSource === "ai" ? "AI Image" : "Stock Media"}
        subtitle={
          props.imageSource === "ai"
            ? "Renders one image per scene with your chosen style + model."
            : "Pulls B-roll photos from Pexels based on the script."
        }
        active
      >
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button
            type="button"
            onClick={() => props.setImageSource("pexels")}
            className={`rounded-lg px-3 py-2 text-xs border ${
              props.imageSource === "pexels"
                ? "border-accent bg-accent/10 text-accent font-semibold"
                : "border-border text-muted"
            }`}
          >
            Stock (Pexels)
          </button>
          <button
            type="button"
            onClick={() => props.setImageSource("ai")}
            className={`rounded-lg px-3 py-2 text-xs border ${
              props.imageSource === "ai"
                ? "border-accent bg-accent/10 text-accent font-semibold"
                : "border-border text-muted"
            }`}
          >
            AI Image
          </button>
        </div>
        {props.imageSource === "ai" && (
          <select
            className="select"
            value={props.imageModelId}
            onChange={(e) => props.setImageModelId(e.target.value)}
          >
            {IMAGE_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        )}
      </CustomCard>

      <CustomCard
        title="Caption"
        subtitle="Burn-in subtitles styled for short-form."
        active={props.burnCaptions}
      >
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={props.burnCaptions}
            onChange={(e) => props.setBurnCaptions(e.target.checked)}
          />
          Burn captions into the video
        </label>
      </CustomCard>

      <CustomCard
        title="Background music"
        subtitle="Suno-generated soundtrack mixed under narration."
        active={props.generateMusic}
      >
        <label className="flex items-center gap-2 text-sm mb-2">
          <input
            type="checkbox"
            checked={props.generateMusic}
            onChange={(e) => props.setGenerateMusic(e.target.checked)}
          />
          Add background music
        </label>
        {props.generateMusic && (
          <div className="space-y-2">
            <select
              className="select"
              value={props.musicModelId}
              onChange={(e) => props.setMusicModelId(e.target.value)}
            >
              {MUSIC_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <input
              className="input"
              value={props.musicPrompt}
              onChange={(e) => props.setMusicPrompt(e.target.value)}
              placeholder="Optional: 'cinematic, warm strings'"
            />
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={props.duckMusic}
                onChange={(e) => props.setDuckMusic(e.target.checked)}
              />
              Duck under narration
            </label>
          </div>
        )}
      </CustomCard>

      <CustomCard title="Color grade" subtitle="Apply a global look." active={props.colorGrade !== "none"}>
        <select
          className="select"
          value={props.colorGrade}
          onChange={(e) => props.setColorGrade(e.target.value as "none" | "cinematic" | "warm" | "cool" | "bw")}
        >
          {COLOR_GRADES.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
      </CustomCard>

      <CustomCard
        title="Pause between scenes"
        subtitle="Silence padded after each scene's narration so cuts don't feel rushed."
        active={props.scenePauseSec > 0}
      >
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={props.scenePauseSec}
            onChange={(e) => props.setScenePauseSec(Number(e.target.value))}
            className="flex-1 accent-accent"
          />
          <span className="text-sm font-mono w-14 text-right tabular-nums">
            {props.scenePauseSec.toFixed(1)}s
          </span>
        </div>
        <div className="text-[11px] text-muted mt-1">
          0 = back-to-back. ~0.4s reads naturally. 1s+ feels documentary-paced.
        </div>
      </CustomCard>

      <CustomCard title="Transitions" subtitle="Cuts between scenes." active>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => props.setTransitions("none")}
            className={`rounded-lg px-3 py-2 text-xs border ${
              props.transitions === "none"
                ? "border-accent bg-accent/10 text-accent font-semibold"
                : "border-border text-muted"
            }`}
          >
            None
          </button>
          <button
            type="button"
            onClick={() => props.setTransitions("crossfade")}
            className={`rounded-lg px-3 py-2 text-xs border ${
              props.transitions === "crossfade"
                ? "border-accent bg-accent/10 text-accent font-semibold"
                : "border-border text-muted"
            }`}
          >
            Crossfade
          </button>
        </div>
      </CustomCard>

      <CustomCard title="Title card" subtitle="3-second intro card with the title." active={props.titleCardEnabled}>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={props.titleCardEnabled}
            onChange={(e) => props.setTitleCardEnabled(e.target.checked)}
          />
          Show title card
        </label>
      </CustomCard>

      <CustomCard title="Outro card" subtitle="Closing card before the video ends." active={props.outroCardEnabled}>
        <label className="flex items-center gap-2 text-sm mb-2">
          <input
            type="checkbox"
            checked={props.outroCardEnabled}
            onChange={(e) => props.setOutroCardEnabled(e.target.checked)}
          />
          Show outro card
        </label>
        {props.outroCardEnabled && (
          <input
            className="input"
            value={props.outroCardText}
            onChange={(e) => props.setOutroCardText(e.target.value)}
            placeholder="Thanks for watching"
          />
        )}
      </CustomCard>
    </div>
  );
}

function CustomCard({
  title,
  subtitle,
  active,
  children,
}: {
  title: string;
  subtitle: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border p-4 transition ${
        active ? "border-accent bg-accent/5" : "border-border bg-white"
      }`}
    >
      <div className="text-sm font-semibold text-ink">{title}</div>
      <div className="text-xs text-muted mt-0.5 mb-3">{subtitle}</div>
      {children}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Step 4 — Review (Claude scenes + final submit)
// ----------------------------------------------------------------------------

function Step4Review({
  planning,
  scenes,
  onPlan,
  onScenesChange,
  aspect,
  imageSource,
  imageState,
  onRetry,
}: {
  planning: boolean;
  scenes: PlannedScene[];
  onPlan: () => void;
  onScenesChange: (s: PlannedScene[]) => void;
  aspect: Aspect;
  imageSource: "pexels" | "ai";
  imageState: Record<number, "loading" | "done" | { error: string }>;
  onRetry: (idx: number) => void;
}) {
  const previewAspect =
    aspect === "9:16" ? "aspect-[9/16]" : aspect === "1:1" ? "aspect-square" : "aspect-video";

  function update(idx: number, patch: Partial<PlannedScene>) {
    onScenesChange(scenes.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function remove(idx: number) {
    onScenesChange(scenes.filter((_, i) => i !== idx));
  }

  // Aggregate image-render progress (both sources).
  const renderProgress = useMemo(() => {
    if (scenes.length === 0) return null;
    let done = 0;
    let loading = 0;
    let failed = 0;
    scenes.forEach((s, i) => {
      if (s.selected) done++;
      else if (imageState[i] === "loading") loading++;
      else if (typeof imageState[i] === "object") failed++;
    });
    return { done, loading, failed, total: scenes.length };
  }, [scenes, imageState]);

  function retryAllFailed() {
    scenes.forEach((_, i) => {
      const st = imageState[i];
      if (typeof st === "object" || (!scenes[i].selected && st !== "loading")) {
        onRetry(i);
      }
    });
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="card p-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Scenes & visuals</div>
          <div className="text-xs text-muted mt-0.5">
            Claude splits your script into scenes and matches each one to the visual source you
            picked. Re-plan to refresh.
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary whitespace-nowrap"
          disabled={planning}
          onClick={onPlan}
        >
          {planning ? "Planning…" : scenes.length ? "Re-plan" : "Plan with Claude"}
        </button>
      </div>

      {renderProgress && (
        <div className="card p-3 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="chip">
              {renderProgress.done} / {renderProgress.total} rendered
            </span>
            {renderProgress.loading > 0 && (
              <span className="chip">{renderProgress.loading} rendering…</span>
            )}
            {renderProgress.failed > 0 && (
              <span className="chip text-danger border-danger/30 bg-danger/5">
                {renderProgress.failed} failed
              </span>
            )}
            <span className="text-muted">
              · source: <strong className="text-ink">{imageSource === "ai" ? "AI" : "Pexels"}</strong>
            </span>
          </div>
          {renderProgress.failed > 0 && (
            <button
              type="button"
              onClick={retryAllFailed}
              className="text-xs underline text-accent hover:text-ink"
            >
              Retry all failed
            </button>
          )}
        </div>
      )}

      {scenes.length === 0 && !planning && (
        <div className="card p-8 text-center text-muted text-sm">
          Click <em>Plan with Claude</em> to generate scenes.
        </div>
      )}

      {scenes.length > 0 && (
        <div className="space-y-3">
          {scenes.map((s, i) => {
            const st = imageState[i];
            const loading = st === "loading";
            const errMsg =
              typeof st === "object" && st !== null ? st.error : undefined;
            return (
              <div
                key={i}
                className="card p-3 grid sm:grid-cols-[140px_1fr_auto] gap-3 items-start"
              >
                <div
                  className={`${previewAspect} rounded-lg overflow-hidden border border-border bg-soft flex items-center justify-center text-[11px] text-muted text-center px-2 relative`}
                >
                  {s.selected ? (
                    <img
                      src={s.selected.thumbUrl}
                      alt={s.selected.alt ?? ""}
                      className="w-full h-full object-cover"
                    />
                  ) : loading ? (
                    <span className="animate-pulse">Rendering…</span>
                  ) : errMsg ? (
                    <span className="text-danger">Failed</span>
                  ) : (
                    "No image"
                  )}
                  {!loading && (s.selected || errMsg) && (
                    <button
                      type="button"
                      onClick={() => onRetry(i)}
                      className="absolute bottom-1 right-1 text-[10px] bg-white/90 border border-border rounded px-1.5 py-0.5 hover:border-accent"
                      title={
                        imageSource === "ai"
                          ? "Re-render this scene"
                          : "Find a different Pexels image"
                      }
                    >
                      ↻
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted">
                    Scene {i + 1} · {s.keywords}
                  </div>
                  <textarea
                    className="textarea min-h-[64px] resize-y text-sm"
                    value={s.text}
                    onChange={(e) => update(i, { text: e.target.value })}
                  />
                  {errMsg && (
                    <div className="text-[11px] text-danger flex items-center gap-2">
                      <span className="truncate">{errMsg}</span>
                      <button
                        type="button"
                        onClick={() => onRetry(i)}
                        className="underline shrink-0"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="text-xs text-muted hover:text-danger self-start"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Step 5 — Result
// ----------------------------------------------------------------------------

function Step5Result({
  job,
  scenes,
  aspect,
  title,
}: {
  job: Job | null;
  scenes: PlannedScene[];
  aspect: Aspect;
  title: string;
}) {
  if (!job) {
    return (
      <div className="card p-8 text-center text-muted">
        No job yet. Go back a step and click <em>Generate video</em>.
      </div>
    );
  }
  const terminal = job.status === "done" || job.status === "error";
  const previewAspect =
    aspect === "9:16" ? "aspect-[9/16]" : aspect === "1:1" ? "aspect-square" : "aspect-video";

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-6 max-w-6xl mx-auto">
      <aside className="space-y-3 max-h-[640px] overflow-y-auto pr-1">
        <div className="text-sm font-semibold text-ink">{title}</div>
        {scenes.map((s, i) => (
          <div key={i} className="card p-3 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wide text-muted">Scene {i + 1}</div>
            {s.selected && (
              <img
                src={s.selected.thumbUrl}
                alt=""
                className="w-full aspect-video object-cover rounded"
              />
            )}
            <div className="text-xs text-ink leading-snug">{s.text}</div>
          </div>
        ))}
      </aside>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="chip">
            <span
              className={`w-2 h-2 rounded-full ${
                job.status === "done"
                  ? "bg-success"
                  : job.status === "error"
                    ? "bg-danger"
                    : "bg-amber-500 animate-pulse"
              }`}
            />
            {job.status}
          </span>
          {job.videoUrl && (
            <a href={job.videoUrl} download className="btn btn-ghost text-sm">
              Download MP4
            </a>
          )}
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

        {job.error && <div className="text-sm text-danger whitespace-pre-wrap">{job.error}</div>}

        {job.videoUrl && (
          <video
            controls
            playsInline
            className={`w-full ${previewAspect} rounded-xl bg-black object-cover`}
            src={job.videoUrl}
          />
        )}

        {job.musicUrl && (
          <div>
            <div className="label">Background music</div>
            <audio controls src={job.musicUrl} className="w-full" />
          </div>
        )}
      </div>
    </div>
  );
}

// Memoization helper for canAdvance to suppress unused warning.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _useMemoNoop<T>(v: T): T {
  return useMemo(() => v, [v]);
}
