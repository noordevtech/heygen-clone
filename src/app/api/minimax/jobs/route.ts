import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createJob } from "@/lib/jobs";
import { enqueueVideoJob } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  prompt: z.string().min(3).max(2000),
  firstFrameImageUrl: z.string().url().optional(),
  model: z.string().min(1).max(60),
  resolution: z.enum(["768P", "1080P"]).optional(),
  durationSec: z.number().int().min(3).max(20).optional(),
  platform: z.enum(["youtube", "instagram", "tiktok", "facebook"]).optional(),
  title: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const job = await createJob({ kind: "minimax", ...parsed.data });
  await enqueueVideoJob(job.id);
  return NextResponse.json({ job }, { status: 202 });
}
