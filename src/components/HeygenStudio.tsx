"use client";

import { useEffect, useMemo, useState } from "react";
import type { AspectRatio, Job } from "@/lib/types";

type HeygenAvatar = {
  avatarId: string;
  name: string;
  gender?: string;
  previewImageUrl?: string;
  previewVideoUrl?: string;
  premium?: boolean;
};

type HeygenVoice = {
  voiceId: string;
  name: string;
  language?: string;
  gender?: string;
  previewAudio?: string;
  supportPause?: boolean;
  emotionSupport?: boolean;
};

const ASPECTS: { value: AspectRatio; label: string; hint: string }[] = [
  { value: "16:9", label: "16:9", hint: "YouTube · landscape" },
  { value: "9:16", label: "9:16", hint: "Reels · TikTok · Shorts" },
  { value: "1:1", label: "1:1", hint: "Instagram feed" },
];

const AVATAR_STYLES: { value: "normal" | "circle" | "closeUp"; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "circle", label: "Circle" },
  { value: "closeUp", label: "Close-up" },
];

export function HeygenStudio() {
  const [avatars, setAvatars] = useState<HeygenAvatar[]>([]);
  const [avatarsError, setAvatarsError] = useState<string | null>(null);
  const [avatarsLoading, setAvatarsLoading] = useState(true);
  const [avatarFilter, setAvatarFilter] = useState("");

  const [voices, setVoices] = useState<HeygenVoice[]>([]);
  const [voicesError, setVoicesError] = useState<string | null>(null);
  const [voicesLoading, setVoicesLoading] = useState(true);

  const [avatarId, setAvatarId] = useState<string>("");
  const [avatarStyle, setAvatarStyle] = useState<"normal" | "circle" | "closeUp">("normal");
  const [voiceId, setVoiceId] = useState<string>("");
  const [script, setScript] = useState(
    "Hi! Welcome to my channel. Today I'm going to show you something that completely changed how I work.",
  );
  const [aspect, setAspect] = useState<AspectRatio>("16:9");
  const [speed, setSpeed] = useState(1.0);
  const [background, setBackground] = useState("#ffffff");

  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAvatarsLoading(true);
    fetch("/api/heygen/avatars")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `Failed (${r.status})`);
        return r.json() as Promise<{ avatars: HeygenAvatar[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setAvatars(data.avatars);
        if (data.avatars[0]) setAvatarId(data.avatars[0].avatarId);
      })
      .catch((e: Error) => !cancelled && setAvatarsError(e.message))
      .finally(() => !cancelled && setAvatarsLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setVoicesLoading(true);
    fetch("/api/heygen/voices")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? `Failed (${r.status})`);
        return r.json() as Promise<{ voices: HeygenVoice[] }>;
      })
      .then((data) => {
        if (cancelled) return;
        setVoices(data.voices);
        if (data.voices[0]) setVoiceId(data.voices[0].voiceId);
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
      const data = (await r.json()) as { job: Job };
      setJob(data.job);
    }, 3000);
    return () => clearInterval(t);
  }, [job]);

  const filteredAvatars = useMemo(() => {
    const q = avatarFilter.trim().toLowerCase();
    if (!q) return avatars;
    return avatars.filter((a) => a.name.toLowerCase().includes(q));
  }, [avatars, avatarFilter]);

  const selectedAvatar = avatars.find((a) => a.avatarId === avatarId);
  const selectedVoice = voices.find((v) => v.voiceId === voiceId);

  const canSubmit = useMemo(
    () => !submitting && script.trim().length > 0 && avatarId.length > 0 && voiceId.length > 0,
    [submitting, script, avatarId, voiceId],
  );

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/heygen/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: script.slice(0, 60),
          avatarId,
          avatarName: selectedAvatar?.name,
          avatarStyle,
          voiceId,
          voiceName: selectedVoice?.name,
          script,
          speed,
          aspect,
          background,
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
        <h2 className="text-xl font-semibold">Create a HeyGen video</h2>

        {/* Avatar picker */}
        <div>
          <div className="label flex items-center justify-between">
            <span>Avatar</span>
            {selectedAvatar && (
              <span className="chip text-[10px]">{selectedAvatar.name}</span>
            )}
          </div>
          {avatarsError ? (
            <div className="text-xs text-red-400">
              {avatarsError}. Add your HeyGen API key on the{" "}
              <a href="/settings" className="underline hover:text-ink">
                Settings page
              </a>
              .
            </div>
          ) : avatarsLoading ? (
            <div className="text-sm text-muted">Loading avatars…</div>
          ) : avatars.length === 0 ? (
            <div className="text-sm text-muted">
              No avatars found on your HeyGen account. Create one in HeyGen first.
            </div>
          ) : (
            <>
              <input
                className="input mb-3"
                placeholder="Search avatars…"
                value={avatarFilter}
                onChange={(e) => setAvatarFilter(e.target.value)}
              />
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[320px] overflow-y-auto pr-1">
                {filteredAvatars.map((a) => (
                  <button
                    key={a.avatarId}
                    type="button"
                    onClick={() => setAvatarId(a.avatarId)}
                    title={a.name}
                    className={`relative rounded-xl border overflow-hidden text-left aspect-[3/4] ${
                      avatarId === a.avatarId
                        ? "border-accent ring-2 ring-accent/40"
                        : "border-border hover:border-muted"
                    }`}
                  >
                    {a.previewImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={a.previewImageUrl}
                        alt={a.name}
                        className="w-full h-full object-cover bg-soft"
                      />
                    ) : (
                      <div className="w-full h-full bg-soft" />
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1">
                      <div className="text-[10px] text-white truncate">{a.name}</div>
                    </div>
                    {a.premium && (
                      <span className="absolute top-1 right-1 text-[8px] uppercase bg-accent text-white px-1 rounded">
                        Pro
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div>
          <div className="label">Avatar style</div>
          <div className="grid grid-cols-3 gap-2">
            {AVATAR_STYLES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setAvatarStyle(s.value)}
                className={`rounded-xl px-3 py-2 border text-sm font-semibold ${
                  avatarStyle === s.value
                    ? "border-accent bg-accent/10"
                    : "border-border hover:border-muted"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Voice */}
        <div>
          <div className="label">Voice (HeyGen)</div>
          <select
            className="select"
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            disabled={voicesLoading || voices.length === 0}
          >
            {voicesLoading && <option>Loading voices…</option>}
            {!voicesLoading && voices.length === 0 && <option>No voices available</option>}
            {voices.map((v) => (
              <option key={v.voiceId} value={v.voiceId}>
                {v.name}
                {v.language ? ` · ${v.language}` : ""}
                {v.gender ? ` · ${v.gender}` : ""}
              </option>
            ))}
          </select>
          {voicesError && (
            <div className="text-xs text-red-400 mt-1">
              {voicesError}. Set the HeyGen API key on the Settings page.
            </div>
          )}
          {selectedVoice?.previewAudio && (
            <audio controls src={selectedVoice.previewAudio} className="w-full mt-2 h-9" />
          )}
        </div>

        {/* Script */}
        <div>
          <div className="label">Script</div>
          <textarea
            className="textarea min-h-[140px] resize-y"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder="What your avatar will say…"
          />
          <div className="text-xs text-muted mt-1">{script.length} / 5000</div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <div className="label">Voice speed</div>
            <input
              type="number"
              step={0.1}
              min={0.5}
              max={1.5}
              className="input"
              value={speed}
              onChange={(e) =>
                setSpeed(Math.max(0.5, Math.min(1.5, Number(e.target.value) || 1.0)))
              }
            />
          </div>
          <div>
            <div className="label">Background color</div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-10 w-12 rounded border border-border bg-white"
                value={background}
                onChange={(e) => setBackground(e.target.value)}
              />
              <input
                className="input"
                value={background}
                onChange={(e) => setBackground(e.target.value)}
                spellCheck={false}
              />
            </div>
          </div>
        </div>

        <div>
          <div className="label">Aspect ratio</div>
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
        </div>

        <div className="flex items-center gap-3">
          <button onClick={submit} disabled={!canSubmit} className="btn btn-primary">
            {submitting ? "Starting…" : "Generate video"}
          </button>
          {error && <div className="text-sm text-red-400">{error}</div>}
        </div>
      </section>

      <HeygenJobPanel job={job} />
    </div>
  );
}

function HeygenJobPanel({ job }: { job: Job | null }) {
  if (!job) {
    return (
      <section className="card p-6 flex flex-col items-center justify-center text-center text-muted min-h-[400px]">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent to-accent2 mb-4 opacity-80" />
        <div className="text-lg text-ink font-semibold">Your avatar video will appear here</div>
        <div className="text-sm mt-1 max-w-xs">
          Pick an avatar and a voice, type a script, and click{" "}
          <span className="text-ink">Generate video</span>. HeyGen renders take roughly 1–5 minutes.
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

      {job.thumbnailUrl && !job.videoUrl && (
        <img src={job.thumbnailUrl} alt="Poster" className="w-full rounded-xl bg-black" />
      )}

      {job.videoUrl && (
        <>
          <video controls className="w-full rounded-xl bg-black" src={job.videoUrl} />
          <a className="chip hover:border-accent" href={job.videoUrl} download>
            Download MP4
          </a>
        </>
      )}
    </section>
  );
}
