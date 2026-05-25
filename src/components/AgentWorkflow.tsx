"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Idea = {
  title: string;
  hook: string;
  angle: string;
  estDurationMin: number;
};

type Seo = {
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  thumbnailPrompt: string;
};

type JobSummary = {
  id: string;
  status: string;
  createdAt: number;
  videoUrl?: string;
  thumbnailUrl?: string;
  request: { kind?: string; title?: string };
};

type Playlist = { id: string; title: string; itemCount: number };

type PublishResult = {
  videoId: string;
  watchUrl: string;
  studioUrl: string;
  scheduledFor: string | null;
  privacyStatus: string;
  playlistId: string | null;
  playlistTitle: string | null;
  thumbnailWarning?: string;
  playlistWarning?: string;
  note?: string;
};

const TONE_PRESETS = [
  { value: "", label: "Default" },
  { value: "educational and authoritative", label: "Educational" },
  { value: "punchy and irreverent", label: "Punchy" },
  { value: "documentary, calm and reflective", label: "Documentary" },
  { value: "first-person storytelling", label: "Story-driven" },
  { value: "blunt and contrarian", label: "Contrarian" },
];

export function AgentWorkflow() {
  const router = useRouter();

  // Inputs
  const [niche, setNiche] = useState("Personal finance for millennials");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("");
  const [lengthMin, setLengthMin] = useState(8);

  // Stage 1: ideas
  const [brainstorming, setBrainstorming] = useState(false);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [pickedIdea, setPickedIdea] = useState<Idea | null>(null);

  // Stage 2: script
  const [writingScript, setWritingScript] = useState(false);
  const [scriptTitle, setScriptTitle] = useState("");
  const [scriptText, setScriptText] = useState("");

  // Stage 3: SEO
  const [generatingSeo, setGeneratingSeo] = useState(false);
  const [seo, setSeo] = useState<Seo | null>(null);

  // Thumbnail (OpenRouter image gen)
  const [thumbPrompt, setThumbPrompt] = useState("");
  const [thumbAspect, setThumbAspect] = useState<"16:9" | "1:1" | "9:16">("16:9");
  const [thumbProvider, setThumbProvider] = useState<"openrouter" | "openai">("openrouter");
  const [generatingThumb, setGeneratingThumb] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [thumbError, setThumbError] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Publishing Agent (Step 5)
  const [ytStatus, setYtStatus] = useState<{ connected: boolean; channelTitle: string | null } | null>(
    null,
  );
  const [pubJobs, setPubJobs] = useState<JobSummary[]>([]);
  const [pubPlaylists, setPubPlaylists] = useState<Playlist[]>([]);
  const [pubJobId, setPubJobId] = useState("");
  const [pubVideoUrl, setPubVideoUrl] = useState("");
  const [pubPrivacy, setPubPrivacy] = useState<"public" | "unlisted" | "private">("public");
  const [pubScheduleMode, setPubScheduleMode] = useState<"now" | "optimal" | "custom">("now");
  const [pubPublishAt, setPubPublishAt] = useState("");
  const [pubPlaylistChoice, setPubPlaylistChoice] = useState("");
  const [pubNewPlaylistTitle, setPubNewPlaylistTitle] = useState("");
  const [pubMadeForKids, setPubMadeForKids] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/youtube/oauth/status");
        const data = (await res.json()) as { connected?: boolean; channelTitle?: string | null };
        setYtStatus({ connected: !!data.connected, channelTitle: data.channelTitle ?? null });
      } catch {
        setYtStatus({ connected: false, channelTitle: null });
      }
    })();
  }, []);

  useEffect(() => {
    if (!ytStatus?.connected) return;
    // Load completed longform jobs + the user's playlists once connected.
    void (async () => {
      try {
        const res = await fetch("/api/jobs");
        const data = (await res.json()) as { jobs?: JobSummary[] };
        const completed = (data.jobs ?? [])
          .filter((j) => j.status === "done" && j.videoUrl)
          .slice(0, 20);
        setPubJobs(completed);
      } catch {
        /* surfacing this would distract from the main flow */
      }
      try {
        const res = await fetch("/api/youtube/playlists");
        const data = (await res.json()) as { playlists?: Playlist[] };
        setPubPlaylists(data.playlists ?? []);
      } catch {
        /* same */
      }
    })();
  }, [ytStatus?.connected]);

  const pubSelectedJob = pubJobs.find((j) => j.id === pubJobId);
  const pubResolvedTitle = (seo?.title || scriptTitle || pubSelectedJob?.request.title || "").slice(
    0,
    100,
  );
  const pubResolvedDescription = seo
    ? [seo.description, "", seo.hashtags.join(" ")].join("\n").trim()
    : "";

  async function publish() {
    if (!pubResolvedTitle.trim()) {
      setPublishError("Need a title — generate SEO first, or set a working title above.");
      return;
    }
    if (!pubJobId && !pubVideoUrl.trim()) {
      setPublishError("Pick a finished job or paste a video URL to publish.");
      return;
    }
    if (pubScheduleMode === "custom" && !pubPublishAt) {
      setPublishError("Set a publish timestamp or switch to 'Publish now' / 'Optimal'.");
      return;
    }
    setPublishError(null);
    setPublishResult(null);
    setPublishing(true);
    try {
      const body: Record<string, unknown> = {
        title: pubResolvedTitle,
        description: pubResolvedDescription,
        tags: seo?.tags,
        privacyStatus: pubPrivacy,
        madeForKids: pubMadeForKids,
      };
      if (pubJobId) body.jobId = pubJobId;
      else body.videoUrl = pubVideoUrl.trim();
      if (thumbUrl) body.thumbnailUrl = thumbUrl;
      if (pubScheduleMode === "optimal") body.optimal = true;
      if (pubScheduleMode === "custom" && pubPublishAt) {
        body.publishAt = new Date(pubPublishAt).toISOString();
      }
      if (pubPlaylistChoice && pubPlaylistChoice !== "__new__") {
        body.playlistId = pubPlaylistChoice;
      } else if (pubPlaylistChoice === "__new__" && pubNewPlaylistTitle.trim()) {
        body.newPlaylistTitle = pubNewPlaylistTitle.trim();
      }
      const res = await fetch("/api/agent/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as PublishResult & { error?: string };
      if (!res.ok || !data.videoId) {
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      setPublishResult(data);
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  async function brainstorm() {
    setError(null);
    setBrainstorming(true);
    try {
      const res = await fetch("/api/agent/brainstorm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          niche,
          audience: audience || undefined,
          tone: tone || undefined,
          count: 5,
        }),
      });
      const data = (await res.json()) as { ideas?: Idea[]; error?: string };
      if (!res.ok || !data.ideas) throw new Error(data.error ?? `Failed (${res.status})`);
      setIdeas(data.ideas);
      setPickedIdea(null);
      setScriptText("");
      setScriptTitle("");
      setSeo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Brainstorm failed");
    } finally {
      setBrainstorming(false);
    }
  }

  async function writeScript(idea: Idea) {
    setError(null);
    setPickedIdea(idea);
    setScriptText("");
    setScriptTitle("");
    setSeo(null);
    setWritingScript(true);
    try {
      const res = await fetch("/api/agent/script", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic: idea.title,
          hook: idea.hook,
          angle: idea.angle,
          lengthMin: lengthMin || idea.estDurationMin || 8,
          tone: tone || undefined,
        }),
      });
      const data = (await res.json()) as {
        title?: string;
        script?: string;
        error?: string;
      };
      if (!res.ok || !data.script) throw new Error(data.error ?? `Failed (${res.status})`);
      setScriptTitle(data.title ?? idea.title);
      setScriptText(data.script);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Script generation failed");
    } finally {
      setWritingScript(false);
    }
  }

  async function generateSeo() {
    if (!scriptText) return;
    setError(null);
    setGeneratingSeo(true);
    try {
      const res = await fetch("/api/agent/seo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: scriptTitle, script: scriptText }),
      });
      const data = (await res.json()) as Partial<Seo> & { error?: string };
      if (!res.ok || !data.title) throw new Error(data.error ?? `Failed (${res.status})`);
      setSeo(data as Seo);
      // Pre-fill the thumbnail prompt with Claude's suggestion, but keep
      // whatever the user has already typed if they edited it.
      if (data.thumbnailPrompt && !thumbPrompt) {
        setThumbPrompt(data.thumbnailPrompt);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "SEO failed");
    } finally {
      setGeneratingSeo(false);
    }
  }

  async function generateThumbnail() {
    if (!thumbPrompt.trim()) return;
    setThumbError(null);
    setGeneratingThumb(true);
    try {
      const res = await fetch("/api/agent/thumbnail", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: thumbPrompt,
          aspect: thumbAspect,
          provider: thumbProvider,
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? `Failed (${res.status})`);
      setThumbUrl(data.url);
    } catch (e) {
      setThumbError(e instanceof Error ? e.message : "Thumbnail generation failed");
    } finally {
      setGeneratingThumb(false);
    }
  }

  function continueInWizard() {
    if (!scriptText) return;
    // Pass the script and title to the YouTube wizard via sessionStorage —
    // URL params would blow past the URL length limit on long scripts.
    sessionStorage.setItem(
      "youtubeWizardPrefill",
      JSON.stringify({
        script: scriptText,
        title: scriptTitle,
        thumbnailPrompt: seo?.thumbnailPrompt,
      }),
    );
    router.push("/youtube");
  }

  async function copySeoPackage() {
    if (!seo) return;
    const text = [
      `TITLE:\n${seo.title}`,
      "",
      `DESCRIPTION:\n${seo.description}\n\n${seo.hashtags.join(" ")}`,
      "",
      `TAGS:\n${seo.tags.join(", ")}`,
      "",
      `THUMBNAIL PROMPT:\n${seo.thumbnailPrompt}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be blocked */
    }
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="card p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-accent">YouTube Agent</h1>
          <p className="text-sm text-muted mt-1">
            One-shot pipeline: niche → topic ideas → full script → SEO metadata → thumbnail →
            Publishing Agent (upload, schedule, playlist). Inspired by{" "}
            <a
              className="underline hover:text-ink"
              href="https://github.com/darkzOGx/youtube-automation-agent"
              target="_blank"
              rel="noreferrer"
            >
              darkzOGx/youtube-automation-agent
            </a>
            .
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <div className="label">Channel niche</div>
            <input
              className="input"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="e.g. personal finance for millennials"
            />
          </div>
          <div>
            <div className="label">Audience (optional)</div>
            <input
              className="input"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="e.g. 25-34, no investing background"
            />
          </div>
          <div>
            <div className="label">Tone</div>
            <select className="select" value={tone} onChange={(e) => setTone(e.target.value)}>
              {TONE_PRESETS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="label">Target length (min)</div>
            <input
              type="number"
              min={1}
              max={30}
              className="input"
              value={lengthMin}
              onChange={(e) =>
                setLengthMin(Math.max(1, Math.min(30, Number(e.target.value) || 8)))
              }
            />
          </div>
        </div>

        <div>
          <button
            onClick={brainstorm}
            disabled={brainstorming || niche.trim().length < 2}
            className="btn btn-primary"
          >
            {brainstorming ? "Thinking…" : ideas.length ? "Re-brainstorm" : "Brainstorm 5 ideas"}
          </button>
        </div>
      </div>

      {ideas.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Pick a topic</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {ideas.map((idea, i) => {
              const active = pickedIdea?.title === idea.title;
              return (
                <button
                  key={i}
                  onClick={() => writeScript(idea)}
                  disabled={writingScript}
                  className={`text-left rounded-xl border p-4 transition ${
                    active
                      ? "border-accent bg-accent/5 ring-2 ring-accent/30"
                      : "border-border bg-white hover:border-muted"
                  }`}
                >
                  <div className="text-sm font-semibold text-ink line-clamp-2">{idea.title}</div>
                  <div className="text-xs text-muted mt-1">~{idea.estDurationMin} min</div>
                  <div className="text-xs text-ink/80 mt-2 line-clamp-2">{idea.hook}</div>
                  <div className="text-[11px] text-muted mt-2 italic line-clamp-2">{idea.angle}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(writingScript || scriptText) && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Script</h2>
            {writingScript && (
              <span className="text-xs text-muted">Claude is writing…</span>
            )}
          </div>
          {scriptText && (
            <>
              <div>
                <div className="label">Working title</div>
                <input
                  className="input"
                  value={scriptTitle}
                  onChange={(e) => setScriptTitle(e.target.value)}
                />
              </div>
              <div>
                <div className="label">Script ({scriptText.length} chars)</div>
                <textarea
                  className="textarea min-h-[280px] resize-y"
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={continueInWizard}
                  className="btn btn-primary"
                  disabled={scriptText.trim().length < 50}
                >
                  Continue in YouTube wizard →
                </button>
                <button
                  onClick={generateSeo}
                  className="btn btn-ghost"
                  disabled={generatingSeo || scriptText.trim().length < 50}
                >
                  {generatingSeo ? "Generating SEO…" : seo ? "Re-generate SEO" : "Generate SEO package"}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {seo && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">YouTube upload package</h2>
            <button
              onClick={copySeoPackage}
              className="btn btn-ghost text-sm"
              title="Copy formatted package to clipboard"
            >
              {copied ? "Copied ✓" : "Copy all"}
            </button>
          </div>

          <SeoField label="Title" value={seo.title} />
          <SeoField label="Description" value={seo.description} multiline />
          <SeoField label="Tags" value={seo.tags.join(", ")} multiline />
          <SeoField label="Hashtags" value={seo.hashtags.join(" ")} />
          <SeoField label="Thumbnail prompt" value={seo.thumbnailPrompt} multiline />
        </div>
      )}

      {(seo || thumbPrompt) && (
        <div className="card p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Eye-catching thumbnail</h2>
            <p className="text-xs text-muted mt-1">
              {thumbProvider === "openai" ? (
                <>
                  Renders via OpenAI <code className="text-ink">gpt-image-1</code> directly
                  (OpenAI retired DALL-E 3 on most accounts and now routes image traffic through
                  the GPT-4o image model). Needs an{" "}
                  <a href="/settings" className="underline hover:text-ink">OpenAI API key</a>.
                  ~$0.04-$0.10/image at high quality.
                </>
              ) : (
                <>
                  Renders via OpenRouter image generation. Default model:{" "}
                  <code className="text-ink">google/gemini-2.5-flash-image-preview</code>.
                  Override the model on the{" "}
                  <a href="/settings" className="underline hover:text-ink">Settings page</a>.
                </>
              )}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 max-w-md">
            <button
              type="button"
              onClick={() => setThumbProvider("openrouter")}
              className={`rounded-lg px-3 py-2 text-xs border text-left ${
                thumbProvider === "openrouter"
                  ? "border-accent bg-accent/10 text-ink font-semibold"
                  : "border-border text-muted hover:border-muted"
              }`}
            >
              <div>OpenRouter</div>
              <div className="text-[10px] text-muted font-normal mt-0.5">
                Gemini Image / FLUX
              </div>
            </button>
            <button
              type="button"
              onClick={() => setThumbProvider("openai")}
              className={`rounded-lg px-3 py-2 text-xs border text-left ${
                thumbProvider === "openai"
                  ? "border-accent bg-accent/10 text-ink font-semibold"
                  : "border-border text-muted hover:border-muted"
              }`}
            >
              <div>OpenAI</div>
              <div className="text-[10px] text-muted font-normal mt-0.5">
                gpt-image-1 (GPT-4o)
              </div>
            </button>
          </div>

          <div>
            <div className="label">Thumbnail prompt</div>
            <textarea
              className="textarea min-h-[80px] resize-y text-sm"
              value={thumbPrompt}
              onChange={(e) => setThumbPrompt(e.target.value)}
              placeholder="Describe a concrete image. E.g.: 'Close-up of a stressed millennial staring at a glowing smartphone in a dark bedroom, dramatic side-lighting, photo-realistic.'"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Aspect:</span>
              {(["16:9", "1:1", "9:16"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setThumbAspect(a)}
                  className={`rounded-full px-3 py-1 border text-xs ${
                    thumbAspect === a
                      ? "border-accent bg-accent/10 text-accent font-semibold"
                      : "border-border text-muted hover:border-muted"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            <button
              onClick={generateThumbnail}
              disabled={generatingThumb || thumbPrompt.trim().length < 5}
              className="btn btn-primary"
            >
              {generatingThumb
                ? "Rendering…"
                : thumbUrl
                  ? "Re-render thumbnail"
                  : "Generate thumbnail"}
            </button>
          </div>

          {thumbError && (
            <div className="text-sm text-danger whitespace-pre-wrap">{thumbError}</div>
          )}

          {thumbUrl && (
            <div className="space-y-2">
              <div
                className={`rounded-lg overflow-hidden border border-border bg-soft ${
                  thumbAspect === "16:9"
                    ? "aspect-video"
                    : thumbAspect === "1:1"
                      ? "aspect-square max-w-md"
                      : "aspect-[9/16] max-w-xs"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbUrl}
                  alt="Generated thumbnail"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex items-center gap-3 text-xs">
                <a
                  href={thumbUrl}
                  download
                  className="underline hover:text-accent text-ink"
                >
                  Download
                </a>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(thumbUrl).catch(() => {});
                  }}
                  className="underline hover:text-accent text-muted"
                >
                  Copy URL
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Publishing Agent</h2>
          <p className="text-xs text-muted mt-1">
            Uploads a finished video to your YouTube channel, optionally schedules it for an
            optimal time, and adds it to a playlist (existing or new). End-screens are NOT
            exposed by the YouTube API — set those in YouTube Studio after upload.
          </p>
        </div>

        {!ytStatus ? (
          <div className="text-xs text-muted">Checking YouTube connection…</div>
        ) : !ytStatus.connected ? (
          <div className="rounded-lg border border-amber-400/40 bg-amber-50 p-3 text-xs text-ink space-y-1">
            <div className="font-semibold">YouTube account not connected.</div>
            <div>
              Add your Google OAuth Client ID + Secret on{" "}
              <a href="/settings" className="underline hover:text-accent">/settings</a> and click
              "Connect YouTube".
            </div>
          </div>
        ) : (
          <>
            <div className="text-xs text-muted">
              Connected as{" "}
              <span className="text-ink font-medium">
                {ytStatus.channelTitle || "your YouTube channel"}
              </span>
              .
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <div className="label">Source — finished job</div>
                <select
                  className="select"
                  value={pubJobId}
                  onChange={(e) => {
                    setPubJobId(e.target.value);
                    if (e.target.value) setPubVideoUrl("");
                  }}
                  disabled={publishing}
                >
                  <option value="">— Or paste a video URL below —</option>
                  {pubJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {(j.request.title || "Untitled").slice(0, 60)} ·{" "}
                      {new Date(j.createdAt).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className="label">…or video URL</div>
                <input
                  className="input"
                  value={pubVideoUrl}
                  onChange={(e) => {
                    setPubVideoUrl(e.target.value);
                    if (e.target.value) setPubJobId("");
                  }}
                  placeholder="https://… (.mp4 from R2 or elsewhere)"
                  disabled={publishing || !!pubJobId}
                />
              </div>
              <div>
                <div className="label">Privacy</div>
                <select
                  className="select"
                  value={pubPrivacy}
                  onChange={(e) =>
                    setPubPrivacy(e.target.value as "public" | "unlisted" | "private")
                  }
                  disabled={publishing}
                >
                  <option value="public">Public</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="private">Private</option>
                </select>
              </div>
              <div>
                <div className="label">Schedule</div>
                <div className="flex flex-wrap gap-2">
                  {(["now", "optimal", "custom"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPubScheduleMode(m)}
                      disabled={publishing}
                      className={`rounded-full px-3 py-1 border text-xs ${
                        pubScheduleMode === m
                          ? "border-accent bg-accent/10 text-accent font-semibold"
                          : "border-border text-muted hover:border-muted"
                      }`}
                    >
                      {m === "now" ? "Publish now" : m === "optimal" ? "Optimal time" : "Custom"}
                    </button>
                  ))}
                </div>
                {pubScheduleMode === "custom" && (
                  <input
                    type="datetime-local"
                    className="input mt-2"
                    value={pubPublishAt}
                    onChange={(e) => setPubPublishAt(e.target.value)}
                    disabled={publishing}
                  />
                )}
                {pubScheduleMode === "optimal" && (
                  <div className="text-[11px] text-muted mt-1">
                    Next Tue / Thu / Sat at 15:00 local time. Cheap heuristic — swap for
                    YouTube Analytics-driven times later.
                  </div>
                )}
              </div>

              <div className="sm:col-span-2">
                <div className="label">Playlist (optional)</div>
                <select
                  className="select"
                  value={pubPlaylistChoice}
                  onChange={(e) => setPubPlaylistChoice(e.target.value)}
                  disabled={publishing}
                >
                  <option value="">— Don&apos;t add to a playlist —</option>
                  {pubPlaylists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} ({p.itemCount})
                    </option>
                  ))}
                  <option value="__new__">+ Create a new playlist…</option>
                </select>
                {pubPlaylistChoice === "__new__" && (
                  <input
                    className="input mt-2"
                    value={pubNewPlaylistTitle}
                    onChange={(e) => setPubNewPlaylistTitle(e.target.value)}
                    placeholder="New playlist title"
                    maxLength={150}
                    disabled={publishing}
                  />
                )}
              </div>

              <label className="text-xs text-muted flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={pubMadeForKids}
                  onChange={(e) => setPubMadeForKids(e.target.checked)}
                  disabled={publishing}
                />
                Made for kids (COPPA)
              </label>
            </div>

            <div className="rounded-lg border border-border bg-soft/40 p-3 text-xs text-muted space-y-1">
              <div>
                <span className="text-ink">Title:</span> {pubResolvedTitle || "—"}
              </div>
              <div>
                <span className="text-ink">Description:</span>{" "}
                {pubResolvedDescription
                  ? `${pubResolvedDescription.slice(0, 120)}${
                      pubResolvedDescription.length > 120 ? "…" : ""
                    }`
                  : "(empty — run Generate SEO package above)"}
              </div>
              <div>
                <span className="text-ink">Tags:</span>{" "}
                {seo?.tags?.length ? seo.tags.join(", ") : "—"}
              </div>
              <div>
                <span className="text-ink">Thumbnail:</span>{" "}
                {thumbUrl ? "from the step above" : "(none — YouTube will auto-generate)"}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button onClick={publish} disabled={publishing} className="btn btn-primary">
                {publishing ? "Uploading… (30-90s)" : "Publish to YouTube"}
              </button>
              {publishError && (
                <div className="text-sm text-danger whitespace-pre-wrap">{publishError}</div>
              )}
            </div>

            {publishResult && (
              <div className="rounded-lg border border-success/40 bg-success/5 p-3 text-sm text-ink space-y-1">
                <div className="font-semibold text-success">
                  Uploaded — videoId {publishResult.videoId}
                </div>
                <div>
                  <a
                    href={publishResult.watchUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-accent"
                  >
                    Watch
                  </a>{" "}
                  ·{" "}
                  <a
                    href={publishResult.studioUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-accent"
                  >
                    Open in YouTube Studio
                  </a>
                </div>
                <div className="text-xs text-muted">
                  Status: {publishResult.privacyStatus}
                  {publishResult.scheduledFor
                    ? ` · scheduled for ${new Date(publishResult.scheduledFor).toLocaleString()}`
                    : ""}
                  {publishResult.playlistTitle
                    ? ` · added to ${publishResult.playlistTitle}`
                    : publishResult.playlistId
                      ? ` · added to playlist ${publishResult.playlistId}`
                      : ""}
                </div>
                {publishResult.thumbnailWarning && (
                  <div className="text-xs text-amber-700">
                    Thumbnail not set: {publishResult.thumbnailWarning}
                  </div>
                )}
                {publishResult.playlistWarning && (
                  <div className="text-xs text-amber-700">
                    Playlist: {publishResult.playlistWarning}
                  </div>
                )}
                {publishResult.note && (
                  <div className="text-[11px] text-muted italic">{publishResult.note}</div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {error && <div className="card p-4 text-sm text-danger whitespace-pre-wrap">{error}</div>}
    </div>
  );
}

function SeoField({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }
  return (
    <div>
      <div className="label flex items-center justify-between">
        <span>{label}</span>
        <button
          onClick={copy}
          className="text-[10px] text-muted hover:text-accent underline normal-case tracking-normal"
        >
          {copied ? "copied" : "copy"}
        </button>
      </div>
      {multiline ? (
        <textarea
          className="textarea min-h-[80px] resize-y text-sm"
          value={value}
          readOnly
        />
      ) : (
        <input className="input text-sm" value={value} readOnly />
      )}
    </div>
  );
}
