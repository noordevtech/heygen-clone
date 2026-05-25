import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { brainstormTopics } from "@/lib/agent";
import { withUser } from "@/lib/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  niche: z.string().min(2).max(400),
  audience: z.string().max(400).optional(),
  tone: z.string().max(200).optional(),
  count: z.number().int().min(3).max(8).optional(),
});

export async function POST(req: NextRequest) {
  return withUser(async () => {
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
      const ideas = await brainstormTopics(parsed.data);
      return NextResponse.json({ ideas });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Brainstorm failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  });
}
