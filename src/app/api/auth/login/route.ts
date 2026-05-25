import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  createSession,
  findUserByEmail,
  verifyPassword,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }
  const { email, password } = parsed.data;
  const user = await findUserByEmail(email);
  // Use the same error for "no such user" and "wrong password" so attackers
  // can't enumerate accounts.
  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  if (!user.active) {
    return NextResponse.json(
      { error: "Account is inactive. Ask an admin to activate it." },
      { status: 403 },
    );
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }
  const { token, expiresAt } = await createSession(user.id);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    expires: expiresAt,
  });
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      active: user.active,
    },
  });
}
