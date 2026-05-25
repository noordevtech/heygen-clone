import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateAgentThumbnail } from "@/lib/agent-thumbnail";
import { generateDalleThumbnail } from "@/lib/openai-image";
import { withUser } from "@/lib/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  prompt: z.string().min(5).max(2000),
  aspect: z.enum(["16:9", "1:1", "9:16"]).optional(),
  /**
   * Which provider to render with.
   *   "openrouter" (default) → image via OpenRouter chat-completions with
   *                            modalities:["image"] — currently Gemini Image
   *                            or FLUX (OpenRouter does NOT proxy DALL-E 3).
   *   "openai"   → direct OpenAI /v1/images/generations with dall-e-3. Needs
   *                an openai_api_key in /settings.
   */
  provider: z.enum(["openrouter", "openai"]).optional(),
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
    const { prompt, aspect, provider = "openrouter" } = parsed.data;

    try {
      if (provider === "openai") {
        const { url, revisedPrompt } = await generateDalleThumbnail({ prompt, aspect });
        return NextResponse.json({ url, provider, revisedPrompt });
      }
      const { url } = await generateAgentThumbnail({ prompt, aspect });
      return NextResponse.json({ url, provider });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Thumbnail generation failed";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  });
}
