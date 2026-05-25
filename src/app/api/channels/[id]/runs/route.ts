import { NextRequest, NextResponse } from "next/server";
import { listJobsForChannel } from "@/lib/jobs";
import { getChannel } from "@/lib/channels";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const channel = await getChannel(id);
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (me.role !== "admin" && channel.userId !== me.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const jobs = await listJobsForChannel(id, 200);
    const runs = jobs.map((j) => ({
      id: j.id,
      createdAt: j.createdAt,
      updatedAt: j.updatedAt,
      status: j.status,
      progress: j.progress,
      message: j.message ?? null,
      title: (j.request.kind === "longform" && j.request.title) || null,
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
