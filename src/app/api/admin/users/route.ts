import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { createUser, listUsers } from "@/lib/users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CreateBody = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  role: z.enum(["admin", "user"]).optional(),
  active: z.boolean().optional(),
});

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const users = await listUsers();
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = CreateBody.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const detail = first ? `${first.path.join(".") || "body"}: ${first.message}` : "validation failed";
    return NextResponse.json({ error: `Invalid request (${detail})` }, { status: 400 });
  }
  try {
    const user = await createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      role: parsed.data.role ?? "user",
      active: parsed.data.active ?? false,
      createdByUserId: me.id,
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create user";
    // Postgres unique-constraint failure surfaces here when the email exists.
    if (/unique|duplicate/i.test(message)) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
