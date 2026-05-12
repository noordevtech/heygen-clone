import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { refineScript } from "@/lib/anthropic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  script: z.string().min(20).max(80_000),
  instruction: z.string().min(3).max(800),
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
    const result = await refineScript(parsed.data.script, parsed.data.instruction);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refine failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
