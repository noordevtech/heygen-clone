"use client";

import { useEffect, useState } from "react";

type Channel = {
  id: string;
  name: string;
  niche: string;
  createdAt: number;
};

export function TasksTable() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [niche, setNiche] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

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
        body: JSON.stringify({ name: name.trim(), niche: niche.trim() }),
      });
      const data = (await res.json()) as { channel?: Channel; error?: string };
      if (!res.ok || !data.channel) throw new Error(data.error ?? `Failed (${res.status})`);
      setChannels((cs) => [data.channel!, ...cs]);
      setName("");
      setNiche("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAdding(false);
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
    <div className="space-y-6 max-w-4xl mx-auto">
      <form onSubmit={add} className="card p-5 space-y-4">
        <h2 className="text-lg font-semibold">Add a channel</h2>
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
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
          <button
            type="submit"
            disabled={adding || !name.trim() || !niche.trim()}
            className="btn btn-primary whitespace-nowrap"
          >
            {adding ? "Adding…" : "Add channel"}
          </button>
        </div>
        {error && <div className="text-sm text-danger whitespace-pre-wrap">{error}</div>}
      </form>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-soft text-muted text-xs uppercase tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Channel name</th>
              <th className="px-4 py-3 text-left font-semibold">Niche</th>
              <th className="px-4 py-3 text-left font-semibold">Created</th>
              <th className="px-4 py-3 text-right font-semibold w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && channels.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
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
                <td className="px-4 py-3 text-muted">
                  {new Date(c.createdAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => remove(c.id)}
                    disabled={deleting === c.id}
                    className="text-xs text-muted hover:text-danger"
                  >
                    {deleting === c.id ? "Deleting…" : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
