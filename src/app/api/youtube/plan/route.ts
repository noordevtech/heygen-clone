import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { planLongformScenes } from "@/lib/anthropic";
import type { StockPhoto } from "@/lib/stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  script: z.string().min(20).max(20_000),
  imageSource: z.enum(["pexels", "ai"]).optional(),
  imageModelId: z.string().max(100).optional(),
  styleId: z.string().max(60).optional(),
  aspect: z.enum(["9:16", "1:1", "16:9"]).optional(),
});

export type PlannedScene = {
  text: string;
  keywords: string;
  alt?: string;
  selected: StockPhoto | null;
};

export type PlanResponse = {
  title: string;
  scenes: PlannedScene[];
};

/**
 * POST /api/youtube/plan
 * Body: { script, imageSource?, imageModelId?, styleId?, aspect? }
 *
 * Returns ONLY the Claude-planned scene list. Image rendering is intentionally
 * NOT done here for either source:
 *
 *   - AI mode: 30-90s per scene against Kie.ai. Doing 25 in parallel inside
 *     one HTTP request blows past serverless function timeouts and causes
 *     silent partial failures.
 *
 *   - Pexels mode: fast per-call (~200ms), but a single rate-limit, network
 *     hiccup, or zero-result query for one scene used to leave the user with
 *     no per-scene retry path. Surfacing each search as its own request lets
 *     the UI show per-scene progress and a manual "find different image"
 *     picker.
 *
 * The wizard fires /api/youtube/image (AI) or /api/stock/search (Pexels)
 * once per scene with bounded concurrency on the client.
 */
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

  let plan: Awaited<ReturnType<typeof planLongformScenes>>;
  try {
    plan = await planLongformScenes(parsed.data.script);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scene planning failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const scenes: PlannedScene[] = plan.scenes.map((s) => ({ ...s, selected: null }));
  const response: PlanResponse = { title: plan.title, scenes };
  return NextResponse.json(response);
}
