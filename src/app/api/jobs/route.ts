import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createJob, listJobs } from "@/lib/jobs";
import { enqueueVideoJob } from "@/lib/queue";
import { findVideoModel, findImageModel, findMusicModel } from "@/lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  script: z.string().min(1).max(2000),
  voiceId: z.string().min(1),
  voiceModelId: z.string().optional(),

  videoModelId: z.string().min(1),
  aspect: z.enum(["9:16", "1:1", "16:9"]),
  visualPrompt: z.string().max(1000).optional(),
  durationSec: z.number().int().min(2).max(20).optional(),
  avatar: z.boolean().optional(),

  generateImage: z.boolean().optional(),
  imageModelId: z.string().optional(),
  imagePrompt: z.string().max(1000).optional(),

  generateMusic: z.boolean().optional(),
  musicModelId: z.string().optional(),
  musicPrompt: z.string().max(1000).optional(),
  musicInstrumental: z.boolean().optional(),

  styleId: z.string().max(60).optional(),
});

export async function GET() {
  const jobs = await listJobs();
  return NextResponse.json({ jobs });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;
  if (!findVideoModel(data.videoModelId)) {
    return NextResponse.json({ error: `Unknown video model: ${data.videoModelId}` }, { status: 400 });
  }
  if (data.generateImage && (!data.imageModelId || !findImageModel(data.imageModelId))) {
    return NextResponse.json({ error: `Unknown image model: ${data.imageModelId}` }, { status: 400 });
  }
  if (data.generateMusic && (!data.musicModelId || !findMusicModel(data.musicModelId))) {
    return NextResponse.json({ error: `Unknown music model: ${data.musicModelId}` }, { status: 400 });
  }
  const job = await createJob(data);
  await enqueueVideoJob(job.id);
  return NextResponse.json({ job }, { status: 202 });
}
