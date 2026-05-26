"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { STYLE_PRESETS } from "@/lib/catalog";

type Schedule = "daily" | "weekly" | "monthly";

type ChannelRunStatus = "running" | "done" | "error";

type YoutubeConnection = {
  id: string;
  channelTitle: string;
};

type Voice = {
  id: string;
  name: string;
  category?: string;
};

type Channel = {
  id: string;
  name: string;
  niche: string;
  schedule: Schedule;
  runTime: string;
  targetLengthMin: number;
  style: string;
  youtubeConnectionId: string | null;
  voiceId: string | null;
  createdAt: number;
  lastRunAt: number;
  lastStatus: ChannelRunStatus | null;
  lastJobId: string | null;
  lastTitle: string | null;
  lastVideoUrl: string | null;
  lastYoutubeUrl: string | null;
  lastError: string | null;
};

const SCHEDULE_LABEL: Record<Schedule, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const STYLE_LABEL: Record<string, string> = Object.fromEntries(
  STYLE_PRESETS.map((s) => [s.id, s.label]),
);

function LatestVideoCell({ channel }: { channel: Channel }) {
  const when = new Date(channel.lastRunAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (channel.lastStatus === "running") {
    return (
      <div className="space-y-0.5">
        <div className="text-accent font-medium">Running…</div>
        {channel.lastTitle && <div className="text-muted truncate" title={channel.lastTitle}>{channel.lastTitle}</div>}
        <div className="text-muted text-[10px]">Started {when}</div>
      </div>
    );
  }
  if (channel.lastStatus === "done") {
    return (
      <div className="space-y-0.5">
        {channel.lastYoutubeUrl ? (
          <a
            href={channel.lastYoutubeUrl}
            target="_blank"
            rel="noreferrer"
            className="text-success underline hover:text-ink font-medium block truncate"
            title={channel.lastTitle ?? channel.lastYoutubeUrl}
          >
            {channel.lastTitle ?? "View on YouTube"} ↗
          </a>
        ) : channel.lastVideoUrl ? (
          <a
            href={channel.lastVideoUrl}
            target="_blank"
            rel="noreferrer"
            className="text-success underline hover:text-ink font-medium block truncate"
            title={channel.lastTitle ?? channel.lastVideoUrl}
          >
            {channel.lastTitle ?? "View MP4"} ↗
          </a>
        ) : (
          <div className="text-success">Done</div>
        )}
        <div className="text-muted text-[10px]">Published {when}</div>
      </div>
    );
  }
  if (channel.lastStatus === "error") {
    return (
      <div className="space-y-0.5">
        <div className="text-danger font-medium">Error</div>
        {channel.lastError && (
          <div className="text-muted truncate" title={channel.lastError}>
            {channel.lastError}
          </div>
        )}
        <div className="text-muted text-[10px]">Failed {when}</div>
      </div>
    );
  }
  return <span className="text-muted">—</span>;
}

export function TasksTable() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [schedule, setSchedule] = useState<Schedule>("daily");
  const [runTime, setRunTime] = useState("09:00");
  const [targetLengthMin, setTargetLengthMin] = useState(5);
  const [style, setStyle] = useState("none");
  const [youtubeConnectionId, setYoutubeConnectionId] = useState<string>("");
  const [connections, setConnections] = useState<YoutubeConnection[]>([]);
  const [voiceId, setVoiceId] = useState<string>("");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [firing, setFiring] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Channel | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  async function load() {
    setError(null);
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
    // Fetch the user's YouTube connections so the form / row editor can
    // render a picker. Lightweight call — no token info leaks.
    void (async () => {
      try {
        const res = await fetch("/api/youtube/oauth/status");
        const data = (await res.json()) as { connections?: YoutubeConnection[] };
        setConnections(data.connections ?? []);
      } catch {
        /* ignore — picker will show "No connections" */
      }
    })();
    // ElevenLabs voices for the per-channel voiceover picker.
    void (async () => {
      try {
        const res = await fetch("/api/voices");
        const data = (await res.json()) as { voices?: Voice[] };
        setVoices(data.voices ?? []);
      } catch {
        /* ignore — picker will show "(default)" */
      }
    })();
  }, []);

  // Auto-poll the list while any channel is mid-run so the YouTube link
  // appears without a manual refresh.
  useEffect(() => {
    const hasRunning = channels.some((c) => c.lastStatus === "running");
    if (!hasRunning) return;
    const id = setInterval(() => {
      void load();
    }, 8_000);
    return () => clearInterval(id);
  }, [channels]);

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
          youtubeConnectionId: youtubeConnectionId || null,
          voiceId: voiceId || null,
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
      setYoutubeConnectionId("");
      setVoiceId("");
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
      // Refresh the list so the row immediately shows "Running…" with the
      // freshly-picked title; the post-fire polling effect will then catch
      // the YouTube URL once the worker publishes.
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fire");
    } finally {
      setFiring(null);
    }
  }

  function startEdit(c: Channel) {
    setEditingId(c.id);
    setEditDraft({ ...c });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
  }

  async function saveEdit() {
    if (!editingId || !editDraft) return;
    if (!editDraft.name.trim() || !editDraft.niche.trim()) {
      setError("Channel name and niche can't be empty");
      return;
    }
    setSavingEdit(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${editingId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: editDraft.name.trim(),
          niche: editDraft.niche.trim(),
          schedule: editDraft.schedule,
          runTime: editDraft.runTime,
          targetLengthMin: editDraft.targetLengthMin,
          style: editDraft.style,
          youtubeConnectionId: editDraft.youtubeConnectionId || null,
          voiceId: editDraft.voiceId || null,
        }),
      });
      const data = (await res.json()) as { channel?: Channel; error?: string };
      if (!res.ok || !data.channel) throw new Error(data.error ?? `Failed (${res.status})`);
      const updated = data.channel;
      setChannels((cs) => cs.map((c) => (c.id === updated.id ? updated : c)));
      setEditingId(null);
      setEditDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingEdit(false);
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
    <div className="space-y-6">
      <form onSubmit={add} className="card p-6 space-y-4">
        <h2 className="text-lg font-semibold">Add a channel</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-[1fr_1fr_120px_110px_110px_160px_180px_180px_auto] gap-3 items-end">
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
          <div>
            <div className="label">Publish to</div>
            <select
              className="select"
              value={youtubeConnectionId}
              onChange={(e) => setYoutubeConnectionId(e.target.value)}
              disabled={connections.length === 0}
            >
              <option value="">
                {connections.length === 0 ? "No YouTube connections" : "— Don't publish —"}
              </option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.channelTitle}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="label">Voiceover</div>
            <select
              className="select"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              disabled={voices.length === 0}
            >
              <option value="">
                {voices.length === 0 ? "No voices available" : "— Default (first) —"}
              </option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.category ? ` · ${v.category}` : ""}
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
          Each channel fires automatically at its run time (server time, UTC on Railway). The
          worker brainstorms 5 ideas, picks the best one, writes the script, renders the video,
          generates SEO, and uploads it to your connected YouTube channel. Use "Fire now" to run
          one immediately.
        </p>
        {error && <div className="text-sm text-danger whitespace-pre-wrap">{error}</div>}
      </form>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-[15px]">
          <thead className="bg-soft text-muted text-xs uppercase tracking-wide">
            <tr>
              <th className="px-6 py-4 text-left font-semibold">Channel</th>
              <th className="px-6 py-4 text-left font-semibold w-28">Schedule</th>
              <th className="px-6 py-4 text-left font-semibold w-28">Run time</th>
              <th className="px-6 py-4 text-left font-semibold w-24">Length</th>
              <th className="px-6 py-4 text-left font-semibold w-36">Style</th>
              <th className="px-6 py-4 text-left font-semibold w-72">Latest video</th>
              <th className="px-6 py-4 text-right font-semibold w-48">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && channels.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted">
                  No channels yet. Add one above.
                </td>
              </tr>
            )}
            {channels.map((c) => {
              const isEditing = editingId === c.id && editDraft;
              if (isEditing && editDraft) {
                return (
                  <tr
                    key={c.id}
                    className="border-t border-border bg-soft/40"
                  >
                    <td className="px-6 py-5 space-y-2">
                      <input
                        className="input"
                        value={editDraft.name}
                        maxLength={200}
                        onChange={(e) =>
                          setEditDraft((d) => (d ? { ...d, name: e.target.value } : d))
                        }
                      />
                      <input
                        className="input"
                        value={editDraft.niche}
                        maxLength={400}
                        onChange={(e) =>
                          setEditDraft((d) => (d ? { ...d, niche: e.target.value } : d))
                        }
                      />
                      <select
                        className="select"
                        value={editDraft.youtubeConnectionId ?? ""}
                        onChange={(e) =>
                          setEditDraft((d) =>
                            d ? { ...d, youtubeConnectionId: e.target.value || null } : d,
                          )
                        }
                        disabled={connections.length === 0}
                        title="YouTube channel to publish to"
                      >
                        <option value="">
                          {connections.length === 0
                            ? "No YouTube connections"
                            : "— Don't publish —"}
                        </option>
                        {connections.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.channelTitle}
                          </option>
                        ))}
                      </select>
                      <select
                        className="select"
                        value={editDraft.voiceId ?? ""}
                        onChange={(e) =>
                          setEditDraft((d) =>
                            d ? { ...d, voiceId: e.target.value || null } : d,
                          )
                        }
                        disabled={voices.length === 0}
                        title="Voiceover"
                      >
                        <option value="">
                          {voices.length === 0
                            ? "No voices available"
                            : "— Default voice —"}
                        </option>
                        {voices.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                            {v.category ? ` · ${v.category}` : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-5">
                      <select
                        className="select"
                        value={editDraft.schedule}
                        onChange={(e) =>
                          setEditDraft((d) =>
                            d ? { ...d, schedule: e.target.value as Schedule } : d,
                          )
                        }
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </td>
                    <td className="px-6 py-5">
                      <input
                        type="time"
                        className="input"
                        value={editDraft.runTime}
                        step={60}
                        onChange={(e) =>
                          setEditDraft((d) => (d ? { ...d, runTime: e.target.value } : d))
                        }
                      />
                    </td>
                    <td className="px-6 py-5">
                      <input
                        type="number"
                        className="input"
                        value={editDraft.targetLengthMin}
                        min={1}
                        max={60}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (!Number.isFinite(n)) return;
                          const clamped = Math.max(1, Math.min(60, Math.round(n)));
                          setEditDraft((d) => (d ? { ...d, targetLengthMin: clamped } : d));
                        }}
                      />
                    </td>
                    <td className="px-6 py-5">
                      <select
                        className="select"
                        value={editDraft.style}
                        onChange={(e) =>
                          setEditDraft((d) => (d ? { ...d, style: e.target.value } : d))
                        }
                      >
                        {STYLE_PRESETS.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-6 py-5 text-muted text-xs">—</td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-3 text-xs">
                        <button
                          onClick={saveEdit}
                          disabled={savingEdit}
                          className="text-success hover:text-ink disabled:opacity-50"
                        >
                          {savingEdit ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={savingEdit}
                          className="text-muted hover:text-ink disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr
                  key={c.id}
                  className="border-t border-border hover:bg-soft/60 transition-colors"
                >
                  <td className="px-6 py-5">
                    <Link
                      href={`/tasks/${c.id}`}
                      className="font-semibold text-ink hover:text-accent transition-colors block leading-tight"
                    >
                      {c.name}
                    </Link>
                    <div className="text-sm text-muted mt-1 line-clamp-2" title={c.niche}>
                      {c.niche}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                      {c.youtubeConnectionId && (
                        <div className="text-[11px] text-muted inline-flex items-center gap-1">
                          <span className="opacity-60">↗</span>
                          {connections.find((conn) => conn.id === c.youtubeConnectionId)
                            ?.channelTitle ?? "YouTube"}
                        </div>
                      )}
                      {c.voiceId && (
                        <div className="text-[11px] text-muted inline-flex items-center gap-1">
                          <span className="opacity-60">Voice:</span>
                          {voices.find((v) => v.id === c.voiceId)?.name ?? "Voice"}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="chip text-[11px]">{SCHEDULE_LABEL[c.schedule]}</span>
                  </td>
                  <td className="px-6 py-5 text-ink/80 font-mono text-[13px] tabular-nums">
                    {c.runTime}
                  </td>
                  <td className="px-6 py-5 text-ink/80 tabular-nums">{c.targetLengthMin} min</td>
                  <td className="px-6 py-5 text-ink/80">
                    <span className="chip text-[11px]">{STYLE_LABEL[c.style] ?? c.style}</span>
                  </td>
                  <td className="px-6 py-5 text-xs">
                    <LatestVideoCell channel={c} />
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end gap-3 text-xs">
                      <button
                        onClick={() => fireNow(c.id, c.name)}
                        disabled={
                          !!firing || !!editingId || c.lastStatus === "running"
                        }
                        className="text-accent hover:text-ink disabled:opacity-50"
                        title="Run the agent + queue a video job for this channel now"
                      >
                        {firing === c.id
                          ? "Firing…"
                          : c.lastStatus === "running"
                            ? "Running…"
                            : "Fire now"}
                      </button>
                      <button
                        onClick={() => startEdit(c)}
                        disabled={!!editingId || firing === c.id || deleting === c.id}
                        className="text-muted hover:text-accent disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => remove(c.id)}
                        disabled={deleting === c.id || firing === c.id || !!editingId}
                        className="text-muted hover:text-danger disabled:opacity-50"
                      >
                        {deleting === c.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
