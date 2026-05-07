import Anthropic from "@anthropic-ai/sdk";
import { resolved } from "./settings";

/**
 * Claude scene planner. Takes a long-form script, returns a structured shot
 * list (scenes + Pexels-friendly keywords) via the Anthropic Messages API.
 *
 * Uses forced tool-use (tool_choice: {type: "tool", name: ...}) for
 * guaranteed structured output. This is more portable than messages.parse +
 * zodOutputFormat (which currently requires Zod 4 — our project pins Zod 3).
 */

export type ScenePlan = {
  title: string;
  scenes: Array<{
    text: string;
    keywords: string;
    alt?: string;
  }>;
};

const SYSTEM_PROMPT = `You are a senior video producer at a YouTube studio. You turn long-form scripts into a scene-by-scene shot list for narrated videos with stock B-roll. Your output drives an automated pipeline that fetches Pexels images and composites a slideshow with ffmpeg, so precision matters.

You will return your plan by calling the submit_scene_plan tool. The pipeline cannot recover from prose, markdown, or commentary — call the tool exactly once with the full plan and do not add any other content.

================================================================
SCENE SPLITTING
================================================================
Break the script into scenes that each represent a single, photographable idea.

Rules:
1. Each scene narrates one cohesive thought. Topic shifts, subject shifts, or mood shifts mark scene boundaries.
2. Never break mid-sentence. Scenes start at sentence boundaries.
3. Aim for ~5-15 seconds of narration per scene (roughly 12-40 spoken words). Longer scenes are fine if a single thought genuinely runs that long.
4. Don't merge unrelated short sentences into one scene just to bulk it up.
5. Don't split a single complete thought into two scenes just because the sentence is long — keep it together.
6. Preserve script order. Don't reorder scenes.
7. The "text" field MUST be drawn from the input script. Light cleanup of typos, double-spaces, or stray punctuation is fine; do not paraphrase or add words the script doesn't have.
8. Strip stage directions and section labels (e.g. "Hook", "Cold Open", "Voiceover:", "[B-roll]", "(beat)") from "text" — never narrate them aloud. Use them only as hints when picking keywords for that scene.

================================================================
KEYWORDS
================================================================
The keywords field drives a Pexels API search. Pexels rewards literal, concrete queries describing photographable subjects. It penalizes abstract or conceptual phrasing.

GOOD keywords (literal, visual, photographable):
- "person meditating sunrise"
- "coffee cup morning kitchen"
- "smartphone screen notification bed"
- "team meeting whiteboard office"
- "runner trail forest morning"
- "hands typing laptop desk"

BAD keywords (abstract, conceptual, non-visual):
- "productivity"            no clear image; Pexels returns nothing distinctive
- "modern lifestyle"        too broad
- "thinking deeply"         Pexels can't picture cognition
- "entrepreneurial mindset" not a photograph
- "success"                 returns clichéd handshake/podium stock
- "motivation"              same problem

When the script is metaphorical or abstract, anchor the keywords to a concrete visual the narration evokes — the literal subject your viewer would imagine. If the line is "your morning is medicine," the visual is "sunlight streaming bedroom window," not "medicine" or "morning."

Each scene should have UNIQUE keywords. Don't reuse the same Pexels query across scenes. Vary the subject, setting, or angle even when scenes touch on the same theme.

Keep keywords lowercase, 2-5 words, no punctuation, no quotes. Don't use "stock photo of" or "image of" — Pexels assumes that.

================================================================
TITLE
================================================================
The title is a concise YouTube-style hook (3-8 words). Summarize the script's payoff, not its premise. Avoid all-caps and excessive emoji.

================================================================
EXAMPLES
================================================================

INPUT SCRIPT:
"""
Most people drink coffee on autopilot. They don't realize their morning sets the tone for everything that follows.

Before you check your phone, your nervous system is in its most receptive state. What you consume in the first ten minutes literally programs your cortisol pattern for the entire day.

Reach for stillness instead. Three minutes of breathing, gratitude, or sunlight will reset your default mode.

Your morning is medicine. Or poison.
"""

CORRECT submit_scene_plan input:
{
  "title": "Why Your Morning Sets the Day",
  "scenes": [
    {"text": "Most people drink coffee on autopilot.", "keywords": "person drinking coffee morning"},
    {"text": "They don't realize their morning sets the tone for everything that follows.", "keywords": "sunrise window peaceful bedroom"},
    {"text": "Before you check your phone, your nervous system is in its most receptive state.", "keywords": "smartphone bedside table morning"},
    {"text": "What you consume in the first ten minutes literally programs your cortisol pattern for the entire day.", "keywords": "calendar clock morning desk"},
    {"text": "Reach for stillness instead.", "keywords": "person meditating quiet room"},
    {"text": "Three minutes of breathing, gratitude, or sunlight will reset your default mode.", "keywords": "sunlight streaming forest path"},
    {"text": "Your morning is medicine. Or poison.", "keywords": "glass water morning kitchen"}
  ]
}

INPUT SCRIPT (with stage directions):
"""
Hook

From Cuban plantations to British grocery shelves — how Tate and Lyle turned sweetness into a 200-year empire.

Cold Open

A spoonful of white sugar on a tablecloth. Voiceover: For two centuries, this small mountain of crystals built the wealth of one family.
"""

CORRECT submit_scene_plan input:
{
  "title": "How One Family Owned the World's Sugar",
  "scenes": [
    {"text": "From Cuban plantations to British grocery shelves — how Tate and Lyle turned sweetness into a 200-year empire.", "keywords": "sugar cane plantation field"},
    {"text": "A spoonful of white sugar on a tablecloth.", "keywords": "spoonful white sugar tablecloth"},
    {"text": "For two centuries, this small mountain of crystals built the wealth of one family.", "keywords": "victorian london wealthy mansion"}
  ]
}

================================================================
ANTI-EXAMPLES (do not produce output like this)
================================================================

WRONG — abstract keywords:
{"text": "Your morning is medicine. Or poison.", "keywords": "morning routine wellness mindset"}
(None of those are photographable. Pexels will return generic stock.)

WRONG — non-verbatim text:
{"text": "Coffee on autopilot is killing your mornings.", "keywords": "coffee cup steam"}
(The script said "Most people drink coffee on autopilot." Don't paraphrase.)

WRONG — broken sentence:
{"text": "Number one: protect a single", "keywords": "person laptop"}
{"text": "ninety-minute block every morning for deep work.", "keywords": "office quiet"}
(Don't split mid-sentence.)

WRONG — narrating stage directions:
{"text": "Hook", "keywords": "spotlight stage"}
{"text": "Voiceover:", "keywords": "microphone studio"}
(Strip section labels and stage cues — they aren't narration.)

WRONG — repeated keywords across scenes:
[
  {"text": "...", "keywords": "person laptop desk"},
  {"text": "...", "keywords": "person laptop desk"},
  {"text": "...", "keywords": "person laptop desk"}
]
(All three scenes will pull near-identical photos. Vary subject/setting.)
`;

const PLAN_TOOL = {
  name: "submit_scene_plan",
  description:
    "Submit the final structured scene plan for the long-form video. Call this tool exactly once.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: {
        type: "string",
        description: "Concise YouTube-style title (3-8 words).",
      },
      scenes: {
        type: "array",
        minItems: 1,
        maxItems: 40,
        items: {
          type: "object",
          properties: {
            text: {
              type: "string",
              description:
                "Verbatim narration drawn from the input script (1-3 sentences).",
            },
            keywords: {
              type: "string",
              description:
                "2-5 lowercase words optimized for Pexels stock-photo search. Concrete, photographable subjects only.",
            },
            alt: {
              type: "string",
              description: "Optional one-sentence description of the ideal B-roll image.",
            },
          },
          required: ["text", "keywords"],
        },
      },
    },
    required: ["title", "scenes"],
  },
};

let _client: Anthropic | null = null;
async function client(): Promise<Anthropic> {
  if (_client) return _client;
  _client = new Anthropic({ apiKey: await resolved.anthropicApiKey() });
  return _client;
}

function isPlanShape(x: unknown): x is ScenePlan {
  if (!x || typeof x !== "object") return false;
  const v = x as Record<string, unknown>;
  if (typeof v.title !== "string" || !Array.isArray(v.scenes)) return false;
  return v.scenes.every(
    (s) =>
      s &&
      typeof s === "object" &&
      typeof (s as Record<string, unknown>).text === "string" &&
      typeof (s as Record<string, unknown>).keywords === "string",
  );
}

export async function planLongformScenes(script: string): Promise<ScenePlan> {
  const c = await client();
  const model = await resolved.anthropicDefaultModel();

  const response = await c.messages.create({
    model,
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    tools: [PLAN_TOOL],
    // Anthropic rejects thinking + any forced tool_choice ("any" or "tool")
    // with: "Thinking may not be enabled when tool_choice forces tool use."
    // Use "auto" instead — the system prompt is opinionated enough that the
    // model reliably calls submit_scene_plan when there's only one tool
    // declared. If it mistakenly returns text, we surface that as an error
    // and the user can retry.
    tool_choice: { type: "auto" },
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `Plan scenes for this script. Call submit_scene_plan exactly once with the result.\n\nScript:\n"""\n${script.trim()}\n"""`,
      },
    ],
  });

  // Preferred path: Claude called the tool with the structured plan.
  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === PLAN_TOOL.name) {
      if (!isPlanShape(block.input)) {
        throw new Error(
          `Claude returned an invalid scene plan shape: ${JSON.stringify(block.input).slice(0, 300)}`,
        );
      }
      return block.input;
    }
  }

  // Fallback: model returned a text block instead of calling the tool.
  // Try to extract a JSON object from any text block.
  for (const block of response.content) {
    if (block.type === "text") {
      const match = block.text.match(/\{[\s\S]*\}/);
      if (!match) continue;
      try {
        const parsed = JSON.parse(match[0]);
        if (isPlanShape(parsed)) return parsed;
      } catch {
        /* fall through */
      }
    }
  }

  throw new Error(
    `Claude did not call submit_scene_plan and no parseable plan was found in the response. stop_reason=${response.stop_reason ?? "unknown"}.`,
  );
}
