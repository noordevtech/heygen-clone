"use client";

import { useEffect, useState } from "react";

type ManagedUser = {
  id: string;
  email: string;
  role: "admin" | "user";
  active: boolean;
  createdAt: number;
  createdByUserId: string | null;
};

export function AdminPanel({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Create form
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "user">("user");
  const [newActive, setNewActive] = useState(true);
  const [creating, setCreating] = useState(false);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      const data = (await res.json()) as { users?: ManagedUser[]; error?: string };
      if (!res.ok || !data.users) throw new Error(data.error ?? `Failed (${res.status})`);
      setUsers(data.users);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim() || !newPassword) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim(),
          password: newPassword,
          role: newRole,
          active: newActive,
        }),
      });
      const data = (await res.json()) as { user?: ManagedUser; error?: string };
      if (!res.ok || !data.user) throw new Error(data.error ?? `Failed (${res.status})`);
      setUsers((us) => [data.user!, ...us]);
      setNewEmail("");
      setNewPassword("");
      setNewRole("user");
      setNewActive(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  async function patch(id: string, body: Partial<{ active: boolean; role: "admin" | "user" }>) {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { user?: ManagedUser; error?: string };
      if (!res.ok || !data.user) throw new Error(data.error ?? `Failed (${res.status})`);
      setUsers((us) => us.map((u) => (u.id === id ? data.user! : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update user");
    } finally {
      setBusy(null);
    }
  }

  async function resetPassword(id: string) {
    const password = prompt("New password (min 8 chars):");
    if (!password) return;
    if (password.length < 8) {
      alert("Password must be at least 8 characters.");
      return;
    }
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      alert("Password reset. The user's existing sessions have been revoked.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset password");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string, email: string) {
    if (!confirm(`Delete user ${email}? This cannot be undone.`)) return;
    setBusy(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Failed (${res.status})`);
      }
      setUsers((us) => us.filter((u) => u.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete user");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="card p-6 space-y-4">
        <h2 className="text-lg font-semibold">Create account</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-[1fr_1fr_140px_120px_auto] gap-3 items-end">
          <div>
            <div className="label">Email</div>
            <input
              type="email"
              className="input"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="user@example.com"
              required
            />
          </div>
          <div>
            <div className="label">Password</div>
            <input
              type="password"
              className="input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 characters"
              minLength={8}
              required
            />
          </div>
          <div>
            <div className="label">Role</div>
            <select
              className="select"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as "admin" | "user")}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm pb-2">
            <input
              type="checkbox"
              checked={newActive}
              onChange={(e) => setNewActive(e.target.checked)}
            />
            Active
          </label>
          <button
            type="submit"
            disabled={creating || !newEmail.trim() || !newPassword}
            className="btn btn-primary whitespace-nowrap"
          >
            {creating ? "Creating…" : "Create user"}
          </button>
        </div>
        <p className="text-[11px] text-muted">
          Inactive accounts can&apos;t log in. You can flip the toggle later from the table below.
        </p>
        {error && <div className="text-sm text-danger whitespace-pre-wrap">{error}</div>}
      </form>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-[15px]">
          <thead className="bg-soft text-muted text-xs uppercase tracking-wide">
            <tr>
              <th className="px-6 py-4 text-left font-semibold">Email</th>
              <th className="px-6 py-4 text-left font-semibold w-28">Role</th>
              <th className="px-6 py-4 text-left font-semibold w-28">Status</th>
              <th className="px-6 py-4 text-left font-semibold w-44">Created</th>
              <th className="px-6 py-4 text-right font-semibold w-72">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-muted">
                  No users yet.
                </td>
              </tr>
            )}
            {users.map((u) => {
              const isSelf = u.id === currentUserId;
              return (
                <tr key={u.id} className="border-t border-border hover:bg-soft/40">
                  <td className="px-6 py-4 font-medium text-ink">
                    {u.email}
                    {isSelf && <span className="text-xs text-muted ml-2">(you)</span>}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`chip text-[11px] ${u.role === "admin" ? "border-accent text-accent" : ""}`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {u.active ? (
                      <span className="chip text-[11px] text-success border-success/30 bg-success/10">
                        Active
                      </span>
                    ) : (
                      <span className="chip text-[11px] text-muted">Inactive</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-muted text-xs">
                    {new Date(u.createdAt).toLocaleString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-4 text-xs">
                      <button
                        onClick={() => patch(u.id, { active: !u.active })}
                        disabled={busy === u.id || (isSelf && u.active)}
                        className="text-accent hover:text-ink disabled:opacity-50"
                        title={isSelf && u.active ? "You can't deactivate yourself" : ""}
                      >
                        {u.active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() =>
                          patch(u.id, { role: u.role === "admin" ? "user" : "admin" })
                        }
                        disabled={busy === u.id || (isSelf && u.role === "admin")}
                        className="text-muted hover:text-ink disabled:opacity-50"
                        title={
                          isSelf && u.role === "admin"
                            ? "You can't strip your own admin role"
                            : ""
                        }
                      >
                        Make {u.role === "admin" ? "user" : "admin"}
                      </button>
                      <button
                        onClick={() => resetPassword(u.id)}
                        disabled={busy === u.id}
                        className="text-muted hover:text-ink disabled:opacity-50"
                      >
                        Reset password
                      </button>
                      <button
                        onClick={() => remove(u.id, u.email)}
                        disabled={busy === u.id || isSelf}
                        className="text-muted hover:text-danger disabled:opacity-50"
                        title={isSelf ? "You can't delete yourself" : ""}
                      >
                        Delete
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
