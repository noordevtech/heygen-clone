import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createJob } from "@/lib/jobs";
import { enqueueVideoJob } from "@/lib/queue";
import { getSessionUser } from "@/lib/auth";
import type { HeygenRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  title: z.string().max(100).optional(),
  avatarId: z.string().min(1),
  avatarName: z.string().max(200).optional(),
  avatarStyle: z.enum(["normal", "circle", "closeUp"]).optional(),
  voiceId: z.string().min(1),
  voiceName: z.string().max(200).optional(),
  script: z.string().min(1).max(5000),
  speed: z.number().min(0.5).max(1.5).optional(),
  aspect: z.enum(["9:16", "1:1", "16:9"]),
  background: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Background must be a hex color like #ffffff")
    .optional(),
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
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const request: HeygenRequest = { kind: "heygen", ...parsed.data };
  const job = await createJob(request, me.id);
  await enqueueVideoJob(job.id);
  return NextResponse.json({ job }, { status: 202 });
}
