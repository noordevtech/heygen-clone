import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createJob, listJobs } from "@/lib/jobs";
import { runPipeline } from "@/lib/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  script: z.string().min(1).max(2000),
  voiceId: z.string().min(1),
  voiceModelId: z.string().optional(),
  videoModel: z.enum(["seedance", "veo"]),
  aspect: z.enum(["9:16", "1:1", "16:9"]),
  visualPrompt: z.string().max(1000).optional(),
  durationSec: z.number().int().min(2).max(20).optional(),
  avatar: z.boolean().optional(),
});

export async function GET() {
  return NextResponse.json({ jobs: listJobs() });
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
  const job = createJob(parsed.data);
  // Fire and forget — pipeline updates job status in the in-memory store.
  void runPipeline(job.id, parsed.data);
  return NextResponse.json({ job }, { status: 202 });
}
