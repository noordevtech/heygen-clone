"use client";

import { useEffect, useState } from "react";
import { STYLE_PRESETS } from "@/lib/catalog";

type Schedule = "daily" | "weekly" | "monthly";

type Channel = {
  id: string;
  name: string;
  niche: string;
  schedule: Schedule;
  runTime: string;
  targetLengthMin: number;
  style: string;
  createdAt: number;
};

const SCHEDULE_LABEL: Record<Schedule, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const STYLE_LABEL: Record<string, string> = Object.fromEntries(
  STYLE_PRESETS.map((s) => [s.id, s.label]),
);

export function TasksTable() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [schedule, setSchedule] = useState<Schedule>("daily");
  const [runTime, setRunTime] = useState("09:00");
  const [targetLengthMin, setTargetLengthMin] = useState(5);
  const [style, setStyle] = useState("none");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [firing, setFiring] = useState<string | null>(null);
  const [fired, setFired] = useState<Record<string, { jobId: string; title: string }>>({});

  async function load() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/channels");
      const data = (await res.json()) as { channels?: Channel[]; error?: string };
      if (!res.ok || !data.channels) throw new Error(data.error ?? `Failed (${res.status})`);
      setChannels(data.channels);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load channels");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !niche.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          niche: niche.trim(),
          schedule,
          runTime,
          targetLengthMin,
          style,
        }),
      });
      const data = (await res.json()) as { channel?: Channel; error?: string };
      if (!res.ok || !data.channel) throw new Error(data.error ?? `Failed (${res.status})`);
      setChannels((cs) => [data.channel!, ...cs]);
      setName("");
      setNiche("");
      setSchedule("daily");
      setRunTime("09:00");
      setTargetLengthMin(5);
      setStyle("none");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  }

  async function fireNow(id: string, name: string) {
    if (firing) return;
    if (
      !confirm(
        `Run the agent now for "${name}"?\n\nThis takes ~30-60s while Claude writes the script and plans scenes, then queues the video job. The page will not refresh — watch /jobs for progress.`,
      )
    ) {
      return;
    }
    setFiring(id);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${id}/fire`, { method: "POST" });
      const data = (await res.json()) as {
        jobId?: string;
        title?: string;
        sceneCount?: number;
        error?: string;
      };
      if (!res.ok || !data.jobId) throw new Error(data.error ?? `Failed (${res.status})`);
      setFired((m) => ({
        ...m,
        [id]: { jobId: data.jobId!, title: data.title ?? "" },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fire");
    } finally {
      setFiring(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this channel?")) return;
    setDeleting(id);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      setChannels((cs) => cs.filter((c) => c.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <form onSubmit={add} className="card p-5 space-y-4">
        <h2 className="text-lg font-semibold">Add a channel</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-[1fr_1fr_120px_110px_110px_160px_auto] gap-3 items-end">
          <div>
            <div className="label">Channel name</div>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Quiet Money"
              maxLength={200}
            />
          </div>
          <div>
            <div className="label">Niche</div>
            <input
              className="input"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              placeholder="e.g. Personal finance for millennials"
              maxLength={400}
            />
          </div>
          <div>
            <div className="label">Schedule</div>
            <select
              className="select"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value as Schedule)}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <div className="label">Run time</div>
            <input
              type="time"
              className="input"
              value={runTime}
              onChange={(e) => setRunTime(e.target.value)}
              step={60}
            />
          </div>
          <div>
            <div className="label">Length (min)</div>
            <input
              type="number"
              className="input"
              value={targetLengthMin}
              min={1}
              max={60}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) setTargetLengthMin(Math.max(1, Math.min(60, Math.round(n))));
              }}
            />
          </div>
          <div>
            <div className="label">Style</div>
            <select
              className="select"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
            >
              {STYLE_PRESETS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={adding || !name.trim() || !niche.trim()}
            className="btn btn-primary whitespace-nowrap"
          >
            {adding ? "Adding…" : "Add channel"}
          </button>
        </div>
        <p className="text-[11px] text-muted">
          Schedule + run time are stored on the channel. Hooking them into a real cron scheduler
          (so the Agent fires automatically) is a follow-up — for now these are reminders for you.
        </p>
        {error && <div className="text-sm text-danger whitespace-pre-wrap">{error}</div>}
      </form>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-soft text-muted text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Channel name</th>
              <th className="px-4 py-3 text-left font-semibold">Niche</th>
              <th className="px-4 py-3 text-left font-semibold w-28">Schedule</th>
              <th className="px-4 py-3 text-left font-semibold w-24">Run time</th>
              <th className="px-4 py-3 text-left font-semibold w-24">Length</th>
              <th className="px-4 py-3 text-left font-semibold w-32">Style</th>
              <th className="px-4 py-3 text-left font-semibold w-32">Created</th>
              <th className="px-4 py-3 text-right font-semibold w-44">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && channels.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted">
                  No channels yet. Add one above.
                </td>
              </tr>
            )}
            {channels.map((c) => (
              <tr
                key={c.id}
                className="border-t border-border hover:bg-soft/60 transition-colors"
              >
                <td className="px-4 py-3 font-medium text-ink">{c.name}</td>
                <td className="px-4 py-3 text-ink/80">{c.niche}</td>
                <td className="px-4 py-3">
                  <span className="chip text-[11px]">{SCHEDULE_LABEL[c.schedule]}</span>
                </td>
                <td className="px-4 py-3 text-ink/80 font-mono text-[13px] tabular-nums">
                  {c.runTime}
                </td>
                <td className="px-4 py-3 text-ink/80 tabular-nums">
                  {c.targetLengthMin} min
                </td>
                <td className="px-4 py-3 text-ink/80">
                  <span className="chip text-[11px]">{STYLE_LABEL[c.style] ?? c.style}</span>
                </td>
                <td className="px-4 py-3 text-muted">
                  {new Date(c.createdAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3 text-xs">
                    {fired[c.id] ? (
                      <a
                        href="/jobs"
                        target="_blank"
                        rel="noreferrer"
                        className="text-success underline hover:text-ink"
                        title={`Job ${fired[c.id].jobId}`}
                      >
                        Fired ✓ View →
                      </a>
                    ) : (
                      <button
                        onClick={() => fireNow(c.id, c.name)}
                        disabled={!!firing}
                        className="text-accent hover:text-ink disabled:opacity-50"
                        title="Run the agent + queue a video job for this channel now"
                      >
                        {firing === c.id ? "Firing…" : "Fire now"}
                      </button>
                    )}
                    <button
                      onClick={() => remove(c.id)}
                      disabled={deleting === c.id || firing === c.id}
                      className="text-muted hover:text-danger disabled:opacity-50"
                    >
                      {deleting === c.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
