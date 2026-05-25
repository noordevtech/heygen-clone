import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createChannel, listChannels } from "@/lib/channels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().min(1).max(200),
  niche: z.string().min(1).max(400),
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
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const channel = await createChannel(parsed.data.name, parsed.data.niche);
    return NextResponse.json({ channel }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create channel";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
