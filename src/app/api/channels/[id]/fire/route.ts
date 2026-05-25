import { NextRequest, NextResponse } from "next/server";
import { runChannelAgentAndQueue } from "@/lib/channel-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/channels/:id/fire
 *
 * "Fire the cron now" — synchronously runs the front half of the channel
 * pipeline (brainstorm → pick best → script → plan scenes → Pexels) and
 * queues a longform video job. The worker handles compositing and then
 * uploads the finished video to YouTube via the post-publish hook.
 *
 * Ignores the channel's schedule + runTime by design — same entry point
 * the scheduler tick uses, just triggered by the UI.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await runChannelAgentAndQueue(id);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fire failed";
    const status = message === "Channel not found" ? 404 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
