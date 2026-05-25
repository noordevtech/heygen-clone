"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SessionUser = { email: string; role: "admin" | "user" };

export function TopNav({ user }: { user: SessionUser | null }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  if (!user) {
    return (
      <nav className="flex items-center gap-6 text-sm text-muted">
        <a href="/login" className="hover:text-ink transition-colors">
          Sign in
        </a>
      </nav>
    );
  }

  return (
    <nav className="flex items-center gap-6 text-sm text-muted">
      <a href="/" className="hover:text-ink transition-colors">Studio</a>
      <a href="/youtube" className="hover:text-ink transition-colors">YouTube</a>
      <a href="/vimax" className="hover:text-ink transition-colors">ViMax</a>
      <a href="/agent" className="hover:text-ink transition-colors">Agent</a>
      <a href="/tasks" className="hover:text-ink transition-colors">Tasks</a>
      <a href="/jobs" className="hover:text-ink transition-colors">Jobs</a>
      <a href="/settings" className="hover:text-ink transition-colors">Settings</a>
      {user.role === "admin" && (
        <a href="/admin" className="hover:text-ink transition-colors font-medium text-accent">
          Admin
        </a>
      )}
      <div className="flex items-center gap-3 pl-3 border-l border-border">
        <span className="text-xs text-muted hidden sm:inline" title={user.email}>
          {user.email}
        </span>
        <button
          onClick={logout}
          disabled={loggingOut}
          className="text-xs text-muted hover:text-danger transition-colors disabled:opacity-50"
        >
          {loggingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </nav>
  );
}
