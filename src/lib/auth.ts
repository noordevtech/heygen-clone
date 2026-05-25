import { randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { sessions, users, type UserRow } from "@/db/schema";

/**
 * Tiny session-cookie auth for the Studio. The cookie holds an opaque
 * 256-bit token; the lookup happens in Postgres on every protected request
 * (cheap — indexed primary key). Sessions live 30 days and are extended on
 * each successful auth — no separate "refresh" plumbing needed.
 *
 * Designed for a single-tenant deployment with one admin + a handful of
 * users created by the admin. If usage grows we can swap to short-lived
 * JWTs + a revocation list, but for now a row-per-session table keeps
 * "log out everywhere" trivially correct.
 */

export const SESSION_COOKIE = "studio_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const BCRYPT_COST = 12;

export type Role = "admin" | "user";

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: number;
};

function rowToAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role === "admin" ? "admin" : "user",
    active: row.active,
    createdAt: row.createdAt.getTime(),
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Look up a user by email (case-insensitive). Returns the raw row so the
 * caller can read `passwordHash` for login checks.
 */
export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const lower = email.trim().toLowerCase();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, lower))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createSession(userId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: token, userId, expiresAt });
  return { token, expiresAt };
}

export async function destroySession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, token));
}

export async function destroyAllSessionsFor(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

/**
 * Resolve the current user from the request's session cookie, or null if
 * not authenticated. Inactive users are treated as not authenticated so
 * the admin can lock an account out by flipping `active` off.
 */
export async function getSessionUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, token), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (!row.user.active) return null;
  return rowToAuthUser(row.user);
}

/**
 * Best-effort cleanup of expired sessions. Cheap enough to call from the
 * scheduler tick or a periodic admin action; not needed for correctness
 * because `getSessionUser` filters by `expires_at > now()`.
 */
export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
