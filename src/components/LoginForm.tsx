"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Login failed (${res.status})`);
      router.push(next || "/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-8 w-full max-w-md space-y-5">
      <div className="space-y-1">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent to-accent2 mb-2" />
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted">
          Use your studio account to access channels, jobs, and settings.
        </p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="input"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="input"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
      </div>

      {error && (
        <div className="text-sm text-danger whitespace-pre-wrap">{error}</div>
      )}

      <button
        type="submit"
        disabled={submitting || !email.trim() || !password}
        className="btn btn-primary w-full disabled:opacity-50"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
