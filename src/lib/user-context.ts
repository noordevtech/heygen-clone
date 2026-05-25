import { AsyncLocalStorage } from "node:async_hooks";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

/**
 * Request-scoped "current user" for the settings + jobs subsystems.
 *
 * Threading an explicit userId through 11 provider helpers + 29 call sites
 * would be invasive. Instead we stash it in AsyncLocalStorage at the
 * request entry point — API routes wrap their handler body, the worker
 * wraps each job's processor, and the scheduler wraps each due channel.
 * `resolved.X()` (and friends) then read the store transparently.
 *
 * AsyncLocalStorage is supported in Next.js's Node runtime + plain Node
 * worker processes. NOT supported in Edge middleware, which is fine — the
 * middleware just checks cookie presence, not setting values.
 */
const userContext = new AsyncLocalStorage<string>();

export function runWithUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return userContext.run(userId, fn);
}

export function currentUserId(): string | undefined {
  return userContext.getStore();
}

/**
 * The admin acts as the platform default — their API keys are used when a
 * regular user hasn't configured their own copy of a given key. Cached
 * because it's called on nearly every settings lookup.
 *
 * Falls back to the first admin row if `info@noordev.com` isn't present
 * (e.g. someone re-keyed the bootstrap admin), so the system stays usable.
 */
let _adminIdCache: string | null = null;
export async function getAdminUserId(): Promise<string> {
  if (_adminIdCache) return _adminIdCache;
  // Prefer the seeded bootstrap admin if it exists.
  let row = (
    await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, "info@noordev.com"))
      .limit(1)
  )[0];
  if (!row) {
    row = (
      await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"))
        .limit(1)
    )[0];
  }
  if (!row) {
    throw new Error(
      "No admin user found. Run migrations to seed info@noordev.com or create an admin first.",
    );
  }
  _adminIdCache = row.id;
  return row.id;
}

/** Effective owner for a settings lookup: explicit arg → ALS → admin. */
export async function effectiveUserId(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const ctx = currentUserId();
  if (ctx) return ctx;
  return getAdminUserId();
}
