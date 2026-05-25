import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createChannel, listChannels } from "@/lib/channels";
import { STYLE_PRESETS } from "@/lib/catalog";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STYLE_IDS = STYLE_PRESETS.map((s) => s.id) as [string, ...string[]];

const Body = z.object({
  name: z.string().min(1).max(200),
  niche: z.string().min(1).max(400),
  schedule: z.enum(["daily", "weekly", "monthly"]).optional(),
  // HH:MM 24-hour. Allows H:MM as well (e.g. "9:00").
  runTime: z
    .string()
    .regex(/^\d{1,2}:\d{2}$/, "runTime must be HH:MM (24h)")
    .optional(),
  targetLengthMin: z.number().int().min(1).max(60).optional(),
  style: z.enum(STYLE_IDS).optional(),
  youtubeConnectionId: z.string().uuid().nullable().optional(),
});

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    // Each user only sees their own channels. The scheduler still scans
    // every user's channels via listChannels() (no arg) — see worker.
    const items = await listChannels(me.id);
    return NextResponse.json({ channels: items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list channels";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const detail = first ? `${first.path.join(".") || "body"}: ${first.message}` : "validation failed";
    return NextResponse.json(
      { error: `Invalid request (${detail})`, issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const runTime = parsed.data.runTime
      ? parsed.data.runTime.replace(/^(\d):/, "0$1:")
      : undefined;
    const channel = await createChannel({ ...parsed.data, runTime, userId: me.id });
    return NextResponse.json({ channel }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create channel";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
