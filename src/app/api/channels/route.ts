import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createChannel, listChannels } from "@/lib/channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().min(1).max(200),
  niche: z.string().min(1).max(400),
  schedule: z.enum(["daily", "weekly", "monthly"]).optional(),
  // HH:MM 24-hour. Allows H:MM as well (e.g. "9:00").
  runTime: z
    .string()
    .regex(/^\d{1,2}:\d{2}$/, "runTime must be HH:MM (24h)")
    .optional(),
});

export async function GET() {
  try {
    const items = await listChannels();
    return NextResponse.json({ channels: items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list channels";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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
    // Normalize "9:00" → "09:00" so the table renders consistent widths.
    const runTime = parsed.data.runTime
      ? parsed.data.runTime.replace(/^(\d):/, "0$1:")
      : undefined;
    const channel = await createChannel({ ...parsed.data, runTime });
    return NextResponse.json({ channel }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create channel";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
