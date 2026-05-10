import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { planLongformScenes } from "@/lib/anthropic";
import { searchPexels, type StockPhoto } from "@/lib/stock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  script: z.string().min(20).max(20_000),
  imageSource: z.enum(["pexels", "ai"]).optional(),
  /** Required for AI mode (validated client-side); we don't render images here
   *  for AI mode anymore — the wizard fires /api/youtube/image per scene. */
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
 * Pipeline:
 *   1. Claude turns the script into { title, scenes[{text, keywords}] }
 *   2. For each scene, attach a `selected` image *only when* imageSource is
 *      "pexels". Pexels search is fast (~200ms/scene) so doing it inline is
 *      safe for any reasonable script.
 *   3. For AI mode we DO NOT render images here. Generating one image per
 *      scene against Kie.ai takes 30-90s each; doing 25+ in parallel inside
 *      a single HTTP request blows past serverless function timeouts and
 *      causes silent partial failures (the symptom: "step 4 didn't generate
 *      all the images"). The wizard's step 4 instead fires
 *      /api/youtube/image once per scene with bounded concurrency, so each
 *      request stays under the timeout and per-scene errors surface
 *      individually with a Retry button.
 */
const ASPECT_TO_ORIENTATION = {
  "9:16": "portrait",
  "1:1": "square",
  "16:9": "landscape",
} as const;

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

  const { script, imageSource = "pexels", aspect = "16:9" } = parsed.data;

  let plan: Awaited<ReturnType<typeof planLongformScenes>>;
  try {
    plan = await planLongformScenes(script);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scene planning failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // AI mode: return scenes without images. Client renders per-scene.
  if (imageSource === "ai") {
    const scenes: PlannedScene[] = plan.scenes.map((s) => ({ ...s, selected: null }));
    return NextResponse.json({ title: plan.title, scenes });
  }

  // Pexels mode: inline parallel search (fast).
  const orientation = ASPECT_TO_ORIENTATION[aspect];
  const scenes: PlannedScene[] = await Promise.all(
    plan.scenes.map(async (s, idx) => {
      try {
        const photos = await searchPexels({
          query: s.keywords,
          orientation,
          perPage: 4,
        });
        return { ...s, selected: photos[0] ?? null };
      } catch (err) {
        console.warn(
          `[plan] pexels failed for scene ${idx + 1}: ${(err as Error).message}`,
        );
        return { ...s, selected: null };
      }
    }),
  );

  const response: PlanResponse = { title: plan.title, scenes };
  return NextResponse.json(response);
}
