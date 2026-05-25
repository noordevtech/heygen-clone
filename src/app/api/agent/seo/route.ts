import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateSeoMetadata } from "@/lib/agent";
import { withUser } from "@/lib/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  title: z.string().min(1).max(400),
  script: z.string().min(50).max(80_000),
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
      const metadata = await generateSeoMetadata(parsed.data);
      return NextResponse.json(metadata);
    } catch (err) {
      const message = err instanceof Error ? err.message : "SEO generation failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  });
}
