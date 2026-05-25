import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { planVimaxStory } from "@/lib/anthropic";
import type { StockPhoto } from "@/lib/stock";
import { withUser } from "@/lib/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  idea: z.string().min(5).max(2000),
  sceneCount: z.number().int().min(2).max(12).optional(),
});

export type VimaxScene = {
  text: string;
  keywords: string;
  alt?: string;
  selected: StockPhoto | null;
  imageError?: string;
};

export type VimaxPlanResponse = {
  title: string;
  scenes: VimaxScene[];
};

/**
 * POST /api/vimax/plan
 *
 * Storyboard-only step. Claude expands the idea into a {title, scenes[text,
 * keywords]} plan and we return it immediately.
 *
 * Image rendering is intentionally NOT done here — generating one image per
 * scene against Kie.ai can take 30-90 s each, and doing 6 in parallel inside
 * a single HTTP request blows past the serverless function timeout on most
 * hosts (Vercel/Railway). The client fires /api/vimax/image once per scene
 * in parallel after this returns; that keeps each request short and lets the
 * UI surface per-scene errors immediately.
 */
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

    let plan: Awaited<ReturnType<typeof planVimaxStory>>;
    try {
      plan = await planVimaxStory(parsed.data.idea, parsed.data.sceneCount ?? 6);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Storyboard planning failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    const scenes: VimaxScene[] = plan.scenes.map((s) => ({ ...s, selected: null }));
    const response: VimaxPlanResponse = { title: plan.title, scenes };
    return NextResponse.json(response);
  });
}
