"use client";

import { useState } from "react";
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

  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "SEO failed");
    } finally {
      setGeneratingSeo(false);
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
            One-shot pipeline: niche → topic ideas → full script → SEO metadata → hand off to the
            YouTube wizard to render and (manually) upload. Inspired by{" "}
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
