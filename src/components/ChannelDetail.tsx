"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [firing, setFiring] = useState(false);

  async function load() {
    setError(null);
    try {
      const [chRes, runsRes] = await Promise.all([
        fetch(`/api/channels/${channelId}`),
        fetch(`/api/channels/${channelId}/runs`),
      ]);
      const chData = (await chRes.json()) as { channel?: Channel; error?: string };
      const runsData = (await runsRes.json()) as { runs?: Run[]; error?: string };
      if (!chRes.ok || !chData.channel) {
        throw new Error(chData.error ?? `Failed to load channel (${chRes.status})`);
      }
      if (!runsRes.ok || !runsData.runs) {
        throw new Error(runsData.error ?? `Failed to load runs (${runsRes.status})`);
      }
      setChannel(chData.channel);
      setRuns(runsData.runs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  // Auto-refresh while any run is in flight so the YouTube URL appears as
  // soon as the worker publishes.
  useEffect(() => {
    const inFlight =
      channel?.lastStatus === "running" ||
      runs.some((r) => !["done", "error"].includes(r.status));
    if (!inFlight) return;
    const id = setInterval(() => void load(), 8_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, runs]);

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
                    <div className="font-medium text-ink leading-snug">
                      {r.title ?? <span className="text-muted">Untitled</span>}
                    </div>
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
