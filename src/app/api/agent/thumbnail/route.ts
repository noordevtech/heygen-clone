import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateAgentThumbnail } from "@/lib/agent-thumbnail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  prompt: z.string().min(5).max(2000),
  aspect: z.enum(["16:9", "1:1", "9:16"]).optional(),
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
    const { url } = await generateAgentThumbnail(parsed.data);
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Thumbnail generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
