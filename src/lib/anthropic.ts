import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { resolved } from "./settings";

/**
 * Claude scene planner. Takes a long-form script, returns a structured shot
 * list (scenes + Pexels-friendly keywords) via the Anthropic Messages API.
 *
 * Uses messages.parse + Zod for guaranteed structured output, adaptive
 * thinking for the reasoning step, and a cache_control breakpoint on the
 * (long-ish) system prompt so repeated runs amortize the prefix.
 */

const SceneSchema = z.object({
  text: z
    .string()
    .min(1)
    .max(800)
    .describe("The verbatim narration this scene plays under (1–3 sentences)."),
  keywords: z
    .string()
    .min(1)
    .max(120)
    .describe(
      "2–5 lowercase words optimized for Pexels stock-photo search. Concrete, photographable subjects only.",
    ),
  alt: z
    .string()
    .max(200)
    .optional()
    .describe("Optional 1-sentence description of the ideal B-roll image."),
});

export const ScenePlanSchema = z.object({
  title: z.string().min(1).max(120).describe("A concise video title (3–8 words)."),
  scenes: z
    .array(SceneSchema)
    .min(1)
    .max(40)
    .describe("Ordered scene list. 3–30 scenes for typical scripts."),
});

export type ScenePlan = z.infer<typeof ScenePlanSchema>;

const SYSTEM_PROMPT = `You are a senior video producer at a YouTube studio. You turn long-form scripts into a scene-by-scene shot list for narrated videos with stock B-roll. Your output drives an automated pipeline that fetches Pexels images and composites a slideshow with ffmpeg, so precision matters.

You must return JSON conforming to the provided schema. The pipeline cannot recover from prose, markdown, commentary, or schema violations — return only the structured object.

================================================================
SCENE SPLITTING
================================================================
Break the script into scenes that each represent a single, photographable idea.

Rules:
1. Each scene narrates one cohesive thought. Topic shifts, subject shifts, or mood shifts mark scene boundaries.
2. Never break mid-sentence. Scenes start at sentence boundaries.
3. Aim for ~5–15 seconds of narration per scene (roughly 12–40 spoken words). Longer scenes are fine if a single thought genuinely runs that long.
4. Don't merge unrelated short sentences into one scene just to bulk it up.
5. Don't split a single complete thought into two scenes just because the sentence is long — keep it together.
6. Preserve script order. Don't reorder scenes.
7. The 'text' field MUST be drawn from the input script. Light cleanup of typos, double-spaces, or stray punctuation is fine; do not paraphrase or add words the script doesn't have.

================================================================
KEYWORDS
================================================================
The keywords field drives a Pexels API search. Pexels rewards literal, concrete queries describing photographable subjects. It penalizes abstract or conceptual phrasing — those return generic shrug-worthy results.

GOOD keywords (literal, visual, photographable):
- "person meditating sunrise"
- "coffee cup morning kitchen"
- "smartphone screen notification bed"
- "team meeting whiteboard office"
- "runner trail forest morning"
- "hands typing laptop desk"

BAD keywords (abstract, conceptual, non-visual):
- "productivity"            → no clear image; Pexels returns nothing distinctive
- "modern lifestyle"        → too broad
- "thinking deeply"         → Pexels can't picture cognition
- "entrepreneurial mindset" → not a photograph
- "success"                 → returns clichéd handshake/podium stock
- "motivation"              → same problem

When the script is metaphorical or abstract, anchor the keywords to a concrete visual the narration evokes — the literal subject your viewer would imagine. If the line is "your morning is medicine," the visual is "sunlight streaming bedroom window," not "medicine" or "morning."

Each scene should have UNIQUE keywords. Don't reuse the same Pexels query across scenes — that would make every image look the same. Vary the subject, setting, or angle even when scenes touch on the same theme.

Keep keywords lowercase, 2–5 words, no punctuation, no quotes. Don't use "stock photo of" or "image of" — Pexels assumes that.

================================================================
TITLE
================================================================
The title is a concise YouTube-style hook (3–8 words). It should summarize the script's payoff, not its premise. Avoid clickbait punctuation (no all-caps, no excessive emoji).

Examples of good titles for the example scripts below: "Three Productivity Hacks That Stick", "Why Your Morning Sets the Day", "The Ninety-Minute Deep Work Block".

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

CORRECT OUTPUT:
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

INPUT SCRIPT:
"""
Three productivity hacks. Number one: protect a single ninety-minute block every morning for deep work — no meetings, no Slack. Number two: batch shallow work into one afternoon session. Number three: end the day with a five-minute review.
"""

CORRECT OUTPUT:
{
  "title": "Three Productivity Hacks That Stick",
  "scenes": [
    {"text": "Three productivity hacks.", "keywords": "checklist notebook open desk"},
    {"text": "Number one: protect a single ninety-minute block every morning for deep work — no meetings, no Slack.", "keywords": "focused person laptop quiet office"},
    {"text": "Number two: batch shallow work into one afternoon session.", "keywords": "stack envelopes desk afternoon"},
    {"text": "Number three: end the day with a five-minute review.", "keywords": "person writing journal evening lamp"}
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

WRONG — repeated keywords across scenes:
[
  {"text": "...", "keywords": "person laptop desk"},
  {"text": "...", "keywords": "person laptop desk"},
  {"text": "...", "keywords": "person laptop desk"}
]
(All three scenes will pull near-identical photos. Vary subject/setting.)
`;

let _client: Anthropic | null = null;

async function client(): Promise<Anthropic> {
  if (_client) return _client;
  _client = new Anthropic({ apiKey: await resolved.anthropicApiKey() });
  return _client;
}

export async function planLongformScenes(script: string): Promise<ScenePlan> {
  const c = await client();
  const model = await resolved.anthropicDefaultModel();

  const response = await c.messages.parse({
    model,
    max_tokens: 8192,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: zodOutputFormat(ScenePlanSchema),
    },
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
        content: `Plan scenes for this script. Return only the structured object.\n\nScript:\n"""\n${script.trim()}\n"""`,
      },
    ],
  });

  if (!response.parsed_output) {
    throw new Error(
      `Claude scene plan failed to parse. stop_reason=${response.stop_reason ?? "unknown"}.`,
    );
  }
  return response.parsed_output;
}
