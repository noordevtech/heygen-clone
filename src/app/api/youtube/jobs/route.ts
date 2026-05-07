import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createJob } from "@/lib/jobs";
import { enqueueVideoJob } from "@/lib/queue";
import { findMusicModel } from "@/lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SceneSchema = z.object({
  text: z.string().min(1).max(800),
  imageUrl: z.string().url(),
  imageAttribution: z.string().max(300).optional(),
});

const RequestSchema = z.object({
  title: z.string().max(200).optional(),
  voiceId: z.string().min(1),
  voiceModelId: z.string().optional(),
  scenes: z.array(SceneSchema).min(1).max(80),
  generateMusic: z.boolean().optional(),
  musicModelId: z.string().optional(),
  musicPrompt: z.string().max(1000).optional(),
  musicInstrumental: z.boolean().optional(),
  width: z.number().int().min(640).max(3840).optional(),
  height: z.number().int().min(360).max(2160).optional(),
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
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }
  const data = parsed.data;
  if (data.generateMusic && (!data.musicModelId || !findMusicModel(data.musicModelId))) {
    return NextResponse.json({ error: `Unknown music model: ${data.musicModelId}` }, { status: 400 });
  }
  const job = await createJob({ kind: "longform", ...data });
  await enqueueVideoJob(job.id);
  return NextResponse.json({ job }, { status: 202 });
}
