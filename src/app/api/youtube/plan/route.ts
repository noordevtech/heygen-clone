import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { planLongformScenes } from "@/lib/anthropic";
import { searchPexels, type StockPhoto } from "@/lib/stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  script: z.string().min(20).max(20_000),
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
 * Body: { script: "..." }
 *
 * Pipeline:
 *   1. Claude turns the script into { title, scenes[{text, keywords}] }
 *   2. For each scene, query Pexels with its keywords; attach the top hit
 *      as `selected`. Failures don't fail the whole request — the UI surfaces
 *      them as "no image yet" so the user can retry per-scene.
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

  // Auto-pick a Pexels image per scene in parallel. Failures degrade
  // gracefully — `selected` stays null and the UI lets the user retry.
  const scenes: PlannedScene[] = await Promise.all(
    plan.scenes.map(async (s) => {
      try {
        const photos = await searchPexels({
          query: s.keywords,
          orientation: "landscape",
          perPage: 4,
        });
        return { ...s, selected: photos[0] ?? null };
      } catch {
        return { ...s, selected: null };
      }
    }),
  );

  const response: PlanResponse = { title: plan.title, scenes };
  return NextResponse.json(response);
}
