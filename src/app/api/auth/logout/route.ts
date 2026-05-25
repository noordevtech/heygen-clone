import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, destroySession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  jar.delete(SESSION_COOKIE);
  return NextResponse.json({ ok: true });
}
