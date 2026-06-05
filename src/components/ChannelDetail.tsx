"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { STYLE_PRESETS } from "@/lib/catalog";

type Schedule = "daily" | "weekly" | "monthly";
type ChannelRunStatus = "running" | "done" | "error";

type Channel = {
  id: string;
  name: string;
  niche: string;
  schedule: Schedule;
  runTime: string;
  targetLengthMin: number;
  style: string;
  createdAt: number;
  lastRunAt: number;
  lastStatus: ChannelRunStatus | null;
  lastJobId: string | null;
  lastTitle: string | null;
  lastVideoUrl: string | null;
  lastYoutubeUrl: string | null;
  lastError: string | null;
};

type Run = {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: string;
  progress: number;
  message: string | null;
  title: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  youtubeUrl: string | null;
  error: string | null;
};

type QueuedTask = {
  id: string;
  title: string;
  description: string;
  status: "pending" | "running" | "done" | "error";
  jobId: string | null;
  createdAt: number;
  pickedAt: number | null;
  completedAt: number | null;
  error: string | null;
};

const STYLE_LABEL: Record<string, string> = Object.fromEntries(
  STYLE_PRESETS.map((s) => [s.id, s.label]),
);

const SCHEDULE_LABEL: Record<Schedule, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const STATUS_BADGE: Record<string, string> = {
  done: "text-success bg-success/10 border-success/30",
  error: "text-danger bg-danger/10 border-danger/30",
  queued: "text-muted bg-soft border-border",
  tts: "text-accent bg-accent/10 border-accent/30",
  video: "text-accent bg-accent/10 border-accent/30",
  image: "text-accent bg-accent/10 border-accent/30",
  music: "text-accent bg-accent/10 border-accent/30",
  compositing: "text-accent bg-accent/10 border-accent/30",
  uploading: "text-accent bg-accent/10 border-accent/30",
};

export function ChannelDetail({ channelId }: { channelId: string }) {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [tasks, setTasks] = useState<QueuedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [firing, setFiring] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [chRes, runsRes, tasksRes] = await Promise.all([
        fetch(`/api/channels/${channelId}`),
        fetch(`/api/channels/${channelId}/runs`),
        fetch(`/api/channels/${channelId}/tasks`),
      ]);
      const chData = (await chRes.json()) as { channel?: Channel; error?: string };
      const runsData = (await runsRes.json()) as { runs?: Run[]; error?: string };
      const tasksData = (await tasksRes.json()) as { tasks?: QueuedTask[]; error?: string };
      if (!chRes.ok || !chData.channel) {
        throw new Error(chData.error ?? `Failed to load channel (${chRes.status})`);
      }
      if (!runsRes.ok || !runsData.runs) {
        throw new Error(runsData.error ?? `Failed to load runs (${runsRes.status})`);
      }
      setChannel(chData.channel);
      setRuns(runsData.runs);
      // Tasks endpoint is optional in older deploys — tolerate failure rather
      // than crashing the whole page.
      setTasks(tasksData.tasks ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setAddingTask(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/tasks`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          description: newTaskDesc.trim(),
        }),
      });
      const data = (await res.json()) as { task?: QueuedTask; error?: string };
      if (!res.ok || !data.task) throw new Error(data.error ?? `Failed (${res.status})`);
      setTasks((t) => [data.task!, ...t]);
      setNewTaskTitle("");
      setNewTaskDesc("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add task");
    } finally {
      setAddingTask(false);
    }
  }

  async function removeTask(id: string) {
    if (!confirm("Remove this queued task?")) return;
    setDeletingTaskId(id);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      setTasks((ts) => ts.filter((t) => t.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete task");
    } finally {
      setDeletingTaskId(null);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  // Auto-refresh while any run is in flight so the YouTube URL appears as
  // soon as the worker publishes. Also polls while a queued task is running
  // so the queue's status badge updates without a manual reload.
  useEffect(() => {
    const inFlight =
      channel?.lastStatus === "running" ||
      runs.some((r) => !["done", "error"].includes(r.status)) ||
      tasks.some((t) => t.status === "running");
    if (!inFlight) return;
    const id = setInterval(() => void load(), 8_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, runs, tasks]);

  async function fireNow() {
    if (!channel || firing) return;
    if (!confirm(`Run the agent now for "${channel.name}"?`)) return;
    setFiring(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/fire`, { method: "POST" });
      const data = (await res.json()) as { jobId?: string; error?: string };
      if (!res.ok || !data.jobId) throw new Error(data.error ?? `Failed (${res.status})`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fire");
    } finally {
      setFiring(false);
    }
  }

  if (loading && !channel) {
    return (
      <main className="max-w-7xl mx-auto">
        <div className="text-muted py-16 text-center">Loading channel…</div>
      </main>
    );
  }
  if (!channel) {
    return (
      <main className="max-w-7xl mx-auto space-y-4">
        <Link href="/tasks" className="text-sm text-muted hover:text-ink">
          ← Back to Tasks
        </Link>
        <div className="card p-8 text-center text-danger">{error ?? "Channel not found"}</div>
      </main>
    );
  }

  const published = runs.filter((r) => r.status === "done" && r.youtubeUrl);

  return (
    <main className="max-w-7xl mx-auto space-y-6">
      <div className="space-y-3">
        <Link href="/tasks" className="text-sm text-muted hover:text-ink inline-flex items-center gap-1">
          ← Back to Tasks
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-semibold text-ink">{channel.name}</h1>
            <p className="text-base text-muted mt-1">{channel.niche}</p>
          </div>
          <button
            onClick={fireNow}
            disabled={firing || channel.lastStatus === "running"}
            className="btn btn-primary disabled:opacity-50"
          >
            {firing
              ? "Firing…"
              : channel.lastStatus === "running"
                ? "Running…"
                : "Fire now"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Schedule" value={SCHEDULE_LABEL[channel.schedule]} />
        <Stat label="Run time (UTC)" value={channel.runTime} />
        <Stat label="Target length" value={`${channel.targetLengthMin} min`} />
        <Stat label="Style" value={STYLE_LABEL[channel.style] ?? channel.style} />
      </div>

      {error && (
        <div className="card p-4 text-sm text-danger whitespace-pre-wrap">{error}</div>
      )}

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">Task queue</h2>
          <div className="text-sm text-muted">
            {tasks.filter((t) => t.status === "pending").length} pending · {tasks.length} total
          </div>
        </div>
        <p className="text-sm text-muted -mt-1">
          When the scheduler fires (or you click <strong className="text-ink">Fire now</strong>),
          the agent picks the <em>oldest pending</em> task from this list as the topic and uses the
          description as the brief. If the queue is empty, it falls back to brainstorming a new
          topic.
        </p>

        <form onSubmit={addTask} className="card p-5 space-y-4">
          <div>
            <div className="label">Topic title</div>
            <input
              className="input"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="e.g. The 1923 German hyperinflation, day by day"
              maxLength={200}
              disabled={addingTask}
            />
          </div>
          <div>
            <div className="label">
              Description (brief the agent will read)
              <span className="ml-2 text-[10px] font-normal text-muted normal-case tracking-normal">
                Markdown — # heading, **bold**, - bullet, &gt; quote
              </span>
            </div>
            <MarkdownEditor
              value={newTaskDesc}
              onChange={setNewTaskDesc}
              disabled={addingTask}
              placeholder={
                "# Hook\nThe Supreme Court ordered the breakup. Rockefeller smiled. Within a decade he was richer than ever. Here is why.\n\n# Cold Open\nQuote a line from the 1911 ruling. Then: in 1911 he was worth 900 million dollars. In 1937 he was worth 1.4 billion. The breakup made him richer.\n\n# Thumbnail Direction\nRockefeller silhouette plus a classical column splitting into multiple smaller columns of equal value."
              }
              maxLength={2000}
            />
          </div>
          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={addingTask || !newTaskTitle.trim()}
              className="btn btn-primary whitespace-nowrap"
            >
              {addingTask ? "Adding…" : "Add task"}
            </button>
          </div>
        </form>

        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-soft text-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="px-5 py-4 text-left font-semibold w-24">Status</th>
                <th className="px-5 py-4 text-left font-semibold">Title</th>
                <th className="px-5 py-4 text-left font-semibold">Description</th>
                <th className="px-5 py-4 text-left font-semibold w-40">Added</th>
                <th className="px-5 py-4 text-right font-semibold w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-muted">
                    No tasks queued. Add one above, or leave the queue empty and the agent will
                    brainstorm a fresh topic on the next run.
                  </td>
                </tr>
              )}
              {tasks.map((t) => (
                <tr key={t.id} className="border-t border-border hover:bg-soft/40 transition-colors">
                  <td className="px-5 py-4 align-top">
                    <span
                      className={`inline-block text-[11px] px-2 py-0.5 rounded-full border ${
                        STATUS_BADGE[t.status] ?? "text-muted bg-soft border-border"
                      }`}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 align-top font-medium text-ink">{t.title}</td>
                  <td className="px-5 py-4 align-top text-xs">
                    {t.description ? (
                      <TaskDescription text={t.description} />
                    ) : (
                      <span className="italic text-muted">—</span>
                    )}
                    {t.error && (
                      <div
                        className="text-xs text-danger mt-1 line-clamp-2"
                        title={t.error}
                      >
                        {t.error}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4 align-top text-muted text-xs">
                    {new Date(t.createdAt).toLocaleString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-5 py-4 align-top text-right">
                    {t.status === "pending" ? (
                      <button
                        onClick={() => removeTask(t.id)}
                        disabled={deletingTaskId === t.id}
                        className="text-xs text-muted hover:text-danger disabled:opacity-50"
                      >
                        {deletingTaskId === t.id ? "Removing…" : "Remove"}
                      </button>
                    ) : t.jobId ? (
                      <Link
                        href="/jobs"
                        className="text-xs text-muted hover:text-ink"
                        title={`Job ${t.jobId}`}
                      >
                        Job
                      </Link>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">Published videos</h2>
          <div className="text-sm text-muted">
            {published.length} published · {runs.length} total run{runs.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead className="bg-soft text-muted text-xs uppercase tracking-wide">
              <tr>
                <th className="px-5 py-4 text-left font-semibold w-28">Thumbnail</th>
                <th className="px-5 py-4 text-left font-semibold">Title</th>
                <th className="px-5 py-4 text-left font-semibold w-32">Status</th>
                <th className="px-5 py-4 text-left font-semibold w-40">When</th>
                <th className="px-5 py-4 text-right font-semibold w-44">Links</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {runs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-muted">
                    No runs yet. Click <strong className="text-ink">Fire now</strong> to produce
                    the first one.
                  </td>
                </tr>
              )}
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-soft/40 transition-colors">
                  <td className="px-5 py-4">
                    {r.thumbnailUrl ? (
                      // Thumbnail is from R2 (our generated image) — display
                      // at a fixed width for table alignment.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.thumbnailUrl}
                        alt=""
                        className="w-24 h-14 object-cover rounded border border-border"
                      />
                    ) : (
                      <div className="w-24 h-14 rounded bg-soft border border-border" />
                    )}
                  </td>
                  <td className="px-5 py-4 align-top">
                    {r.youtubeUrl ? (
                      <a
                        href={r.youtubeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-ink hover:text-accent underline decoration-transparent hover:decoration-accent transition-colors leading-snug"
                      >
                        {r.title ?? "Untitled"}
                      </a>
                    ) : (
                      <div className="font-medium text-ink leading-snug">
                        {r.title ?? <span className="text-muted">Untitled</span>}
                      </div>
                    )}
                    {r.error && (
                      <div className="text-xs text-danger mt-1 line-clamp-2" title={r.error}>
                        {r.error}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4 align-top">
                    <span
                      className={`inline-block text-[11px] px-2 py-0.5 rounded-full border ${
                        STATUS_BADGE[r.status] ?? "text-muted bg-soft border-border"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 align-top text-muted text-xs">
                    {new Date(r.createdAt).toLocaleString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-5 py-4 align-top text-right">
                    <div className="flex items-center justify-end gap-3 text-xs">
                      {r.youtubeUrl && (
                        <a
                          href={r.youtubeUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-success underline hover:text-ink"
                        >
                          YouTube ↗
                        </a>
                      )}
                      {r.videoUrl && (
                        <a
                          href={r.videoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted underline hover:text-ink"
                        >
                          MP4
                        </a>
                      )}
                      <Link
                        href={`/jobs`}
                        className="text-muted hover:text-ink"
                        title={`Job ${r.id}`}
                      >
                        Job
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className="text-base font-semibold text-ink mt-1">{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lightweight markdown editor + renderer for queued-task descriptions.
//
// Scope is deliberately tight: # / ## headings, **bold**, lines starting with
// "- " or "* " as bullets, "> " as quotes, blank lines as paragraph breaks.
// No images, links, code blocks, tables — Claude reads the raw markdown as
// the brief, so the editor only needs to preserve structure the user typed.
// Avoids pulling in react-markdown / a rich-text lib.
// ---------------------------------------------------------------------------

function MarkdownEditor({
  value,
  onChange,
  disabled,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [mode, setMode] = useState<"write" | "preview">("write");

  /** Wrap the current selection with `before` + `after`. If there's no
   *  selection, insert `before` + `after` and place caret between them. */
  function wrapSelection(before: string, after = "") {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = value.slice(0, start) + before + value.slice(start, end) + after + value.slice(end);
    onChange(next);
    // Defer setting selection until React re-renders.
    requestAnimationFrame(() => {
      ta.focus();
      const caret = start + before.length + (end - start);
      ta.setSelectionRange(caret, caret);
    });
  }

  /** Prepend `prefix` to each line in the selection (or the current line). */
  function linePrefix(prefix: string) {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = end + (value.slice(end).indexOf("\n") === -1 ? value.length - end : value.slice(end).indexOf("\n"));
    const block = value.slice(lineStart, lineEnd);
    const updated = block
      .split("\n")
      .map((l) => (l.startsWith(prefix) ? l : prefix + l))
      .join("\n");
    const next = value.slice(0, lineStart) + updated + value.slice(lineEnd);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(lineStart + updated.length, lineStart + updated.length);
    });
  }

  const btn =
    "text-[11px] px-2 py-1 rounded border border-border text-muted hover:text-ink hover:border-muted disabled:opacity-50";

  return (
    <div className="rounded-lg border border-border bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-soft border-b border-border">
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={btn}
            onClick={() => linePrefix("# ")}
            disabled={disabled || mode === "preview"}
            title="Heading"
          >
            H
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => linePrefix("## ")}
            disabled={disabled || mode === "preview"}
            title="Subheading"
          >
            H2
          </button>
          <button
            type="button"
            className={`${btn} font-bold`}
            onClick={() => wrapSelection("**", "**")}
            disabled={disabled || mode === "preview"}
            title="Bold"
          >
            B
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => linePrefix("- ")}
            disabled={disabled || mode === "preview"}
            title="Bullet list"
          >
            •
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => linePrefix("> ")}
            disabled={disabled || mode === "preview"}
            title="Quote"
          >
            “
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`${btn} ${mode === "write" ? "text-ink border-muted" : ""}`}
            onClick={() => setMode("write")}
            disabled={disabled}
          >
            Write
          </button>
          <button
            type="button"
            className={`${btn} ${mode === "preview" ? "text-ink border-muted" : ""}`}
            onClick={() => setMode("preview")}
            disabled={disabled}
          >
            Preview
          </button>
        </div>
      </div>
      {mode === "write" ? (
        <textarea
          ref={taRef}
          className="block w-full px-3 py-2 text-sm bg-white border-0 focus:outline-none focus:ring-0 resize-y min-h-[180px] font-mono text-[13px] leading-relaxed"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          maxLength={maxLength}
          spellCheck
        />
      ) : (
        <div className="px-3 py-2 text-sm min-h-[180px]">
          {value.trim() ? (
            <MarkdownView text={value} />
          ) : (
            <div className="text-muted italic text-xs">Nothing to preview.</div>
          )}
        </div>
      )}
    </div>
  );
}

/** Inline-bold renderer — splits a line into spans, bolding `**foo**`. */
function inlineNodes(line: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) out.push(line.slice(last, m.index));
    out.push(
      <strong key={`${keyBase}-b-${i++}`} className="font-semibold text-ink">
        {m[1]}
      </strong>,
    );
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

function MarkdownView({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let bulletBuf: string[] = [];
  let paraBuf: string[] = [];

  function flushBullets() {
    if (bulletBuf.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-0.5 my-1.5 text-ink/85">
        {bulletBuf.map((b, idx) => (
          <li key={idx}>{inlineNodes(b, `b${blocks.length}-${idx}`)}</li>
        ))}
      </ul>,
    );
    bulletBuf = [];
  }
  function flushParagraph() {
    if (paraBuf.length === 0) return;
    blocks.push(
      <p key={`p-${blocks.length}`} className="text-ink/85 my-1.5 leading-relaxed">
        {inlineNodes(paraBuf.join(" "), `p${blocks.length}`)}
      </p>,
    );
    paraBuf = [];
  }

  for (; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    if (line === "") {
      flushBullets();
      flushParagraph();
      continue;
    }
    if (line.startsWith("## ")) {
      flushBullets();
      flushParagraph();
      blocks.push(
        <h4 key={`h-${blocks.length}`} className="text-sm font-semibold text-ink mt-3 mb-1">
          {line.slice(3)}
        </h4>,
      );
      continue;
    }
    if (line.startsWith("# ")) {
      flushBullets();
      flushParagraph();
      blocks.push(
        <h3 key={`h-${blocks.length}`} className="text-base font-semibold text-ink mt-3 mb-1">
          {line.slice(2)}
        </h3>,
      );
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      flushParagraph();
      bulletBuf.push(line.slice(2));
      continue;
    }
    if (line.startsWith("> ")) {
      flushBullets();
      flushParagraph();
      blocks.push(
        <blockquote
          key={`q-${blocks.length}`}
          className="border-l-2 border-border pl-3 text-muted my-1.5 italic"
        >
          {inlineNodes(line.slice(2), `q${blocks.length}`)}
        </blockquote>,
      );
      continue;
    }
    paraBuf.push(line);
  }
  flushBullets();
  flushParagraph();
  return <div className="space-y-0">{blocks}</div>;
}

/** Table-cell wrapper: rendered markdown + a Show more / less toggle so a
 *  long brief doesn't blow up the row. Defaults to collapsed at ~6 lines. */
function TaskDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const needsClamp = text.length > 240 || text.split("\n").length > 4;
  if (!needsClamp) {
    return (
      <div className="text-[13px]">
        <MarkdownView text={text} />
      </div>
    );
  }
  return (
    <div className="text-[13px]">
      <div className={expanded ? "" : "line-clamp-4 [&_*]:!my-0"}>
        <MarkdownView text={text} />
      </div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-[11px] text-muted hover:text-ink underline mt-1"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}
