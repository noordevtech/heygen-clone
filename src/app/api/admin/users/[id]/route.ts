import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { destroyAllSessionsFor, getSessionUser } from "@/lib/auth";
import { deleteUser, updateUser } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z
  .object({
    active: z.boolean().optional(),
    role: z.enum(["admin", "user"]).optional(),
    password: z.string().min(8).max(200).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "no fields to update");

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const detail = first ? `${first.path.join(".") || "body"}: ${first.message}` : "validation failed";
    return NextResponse.json({ error: `Invalid request (${detail})` }, { status: 400 });
  }
  // Guard: an admin can't strip their own admin role or deactivate themselves
  // accidentally — that would lock the project out.
  if (me.id === id) {
    if (parsed.data.active === false) {
      return NextResponse.json({ error: "Cannot deactivate yourself" }, { status: 400 });
    }
    if (parsed.data.role && parsed.data.role !== "admin") {
      return NextResponse.json(
        { error: "Cannot remove admin role from yourself" },
        { status: 400 },
      );
    }
  }
  const updated = await updateUser(id, parsed.data);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // If we deactivated the user or rotated their password, kill all their
  // existing sessions so they can't keep using the app.
  if (parsed.data.active === false || parsed.data.password) {
    await destroyAllSessionsFor(id);
  }
  return NextResponse.json({ user: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  if (me.id === id) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
  }
  const ok = await deleteUser(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
