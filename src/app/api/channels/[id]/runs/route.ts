import { NextRequest, NextResponse } from "next/server";
import { listJobsForChannel } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/channels/:id/runs
 *
 * Returns the channel's job history — every video the agent has ever
 * produced for this channel, newest first. The Tasks → channel detail
 * page renders these as a table with the YouTube watch URL, thumbnail,
 * status, and timestamps.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const jobs = await listJobsForChannel(id, 200);
    // Compress the response — the detail table only needs a handful of
    // fields, not the full request JSONB / per-scene payload.
    const runs = jobs.map((j) => ({
      id: j.id,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
      status: j.status,
      progress: j.progress,
      message: j.message ?? null,
      title:
        (j.request.kind === "longform" && j.request.title) || null,
      videoUrl: j.videoUrl ?? null,
      thumbnailUrl: j.thumbnailUrl ?? null,
      youtubeUrl: j.youtubeUrl ?? null,
      error: j.error ?? null,
    }));
    return NextResponse.json({ runs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list runs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
