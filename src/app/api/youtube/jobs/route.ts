import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createJob } from "@/lib/jobs";
import { enqueueVideoJob } from "@/lib/queue";
import { findMusicModel } from "@/lib/catalog";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SceneSchema = z.object({
  text: z.string().min(1).max(800),
  imageUrl: z.string().url(),
  videoUrl: z.string().url().optional(),
  mediaType: z.enum(["image", "video"]).optional(),
  imageAttribution: z.string().max(300).optional(),
});

const RequestSchema = z.object({
  title: z.string().max(200).optional(),
  voiceId: z.string().min(1),
  voiceModelId: z.string().optional(),
  scenes: z.array(SceneSchema).min(1).max(300),
  generateMusic: z.boolean().optional(),
  musicModelId: z.string().optional(),
  musicPrompt: z.string().max(1000).optional(),
  musicInstrumental: z.boolean().optional(),
  width: z.number().int().min(640).max(3840).optional(),
  height: z.number().int().min(360).max(2160).optional(),
  transitions: z.enum(["none", "crossfade"]).optional(),
  burnCaptions: z.boolean().optional(),
  colorGrade: z.enum(["none", "cinematic", "warm", "cool", "bw"]).optional(),
  duckMusic: z.boolean().optional(),
  scenePauseSec: z.number().min(0).max(3).optional(),
  titleCard: z
    .object({
      enabled: z.boolean(),
      text: z.string().max(200).optional(),
      durationSec: z.number().min(1).max(15).optional(),
    })
    .optional(),
  outroCard: z
    .object({
      enabled: z.boolean(),
      text: z.string().max(200).optional(),
      durationSec: z.number().min(1).max(15).optional(),
    })
    .optional(),
  styleId: z.string().max(60).optional(),
});

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
  const job = await createJob({ kind: "longform", ...data }, me.id);
  await enqueueVideoJob(job.id);
  return NextResponse.json({ job }, { status: 202 });
}
