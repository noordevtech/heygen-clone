import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeFullScript } from "@/lib/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  topic: z.string().min(3).max(400),
  hook: z.string().max(800).optional(),
  angle: z.string().max(800).optional(),
  lengthMin: z.number().min(1).max(30),
  tone: z.string().max(200).optional(),
});

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
    const result = await writeFullScript(parsed.data);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Script generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
