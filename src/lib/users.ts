import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users, type UserRow } from "@/db/schema";
import { hashPassword, type AuthUser, type Role } from "./auth";

export type ManagedUser = AuthUser & {
  createdByUserId: string | null;
};

function rowToManaged(row: UserRow): ManagedUser {
  return {
    id: row.id,
    email: row.email,
    role: row.role === "admin" ? "admin" : "user",
    active: row.active,
    createdAt: row.createdAt.getTime(),
    createdByUserId: row.createdByUserId ?? null,
  };
}

export async function listUsers(): Promise<ManagedUser[]> {
  const rows = await db.select().from(users).orderBy(desc(users.createdAt));
  return rows.map(rowToManaged);
}

export async function createUser(opts: {
  email: string;
  password: string;
  role?: Role;
  active?: boolean;
  createdByUserId: string;
}): Promise<ManagedUser> {
  const email = opts.email.trim().toLowerCase();
  const passwordHash = await hashPassword(opts.password);
  const [row] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      role: opts.role ?? "user",
      active: opts.active ?? false,
      createdByUserId: opts.createdByUserId,
    })
    .returning();
  return rowToManaged(row);
}

export type UpdateUserPatch = {
  active?: boolean;
  role?: Role;
  password?: string;
};

export async function updateUser(
  id: string,
  patch: UpdateUserPatch,
): Promise<ManagedUser | null> {
  const set: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (patch.active !== undefined) set.active = patch.active;
  if (patch.role !== undefined) set.role = patch.role;
  if (patch.password) set.passwordHash = await hashPassword(patch.password);
  if (Object.keys(set).length === 1) {
    // Only updatedAt — nothing actually changed.
    const existing = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return existing[0] ? rowToManaged(existing[0]) : null;
  }
  const [row] = await db.update(users).set(set).where(eq(users.id, id)).returning();
  return row ? rowToManaged(row) : null;
}

export async function deleteUser(id: string): Promise<boolean> {
  const res = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
  return res.length > 0;
}
