import Anthropic from "@anthropic-ai/sdk";
import { resolved } from "./settings";

/**
 * Agent — the orchestration layer that strings together Claude calls to
 * automate the front half of the YouTube production pipeline:
 *
 *   1. brainstormTopics   — niche → 3-6 video ideas with hooks
 *   2. writeFullScript    — topic → narratable script of N minutes
 *   3. generateSeoMetadata — script → title, description, tags, thumbnail prompt
 *
 * Inspired by github.com/darkzOGx/youtube-automation-agent. Once the agent
 * produces a script + SEO bundle the user hands off to /youtube to render
 * the actual video (and can paste the SEO bundle straight into YouTube
 * Studio for publishing).
 *
 * Each function uses forced tool-use via Claude's Messages API for
 * guaranteed structured output. tool_choice: "auto" so adaptive thinking
 * stays enabled (see CLAUDE.md gotcha — `any` and `tool` count as
 * forced and reject thinking).
 */

let _client: Anthropic | null = null;
async function client(): Promise<Anthropic> {
  if (_client) return _client;
  _client = new Anthropic({ apiKey: await resolved.anthropicApiKey() });
  return _client;
}

// ===========================================================================
// 1. brainstormTopics
// ===========================================================================

export type TopicIdea = {
  title: string;
  hook: string;
  angle: string;
  estDurationMin: number;
};

const BRAINSTORM_TOOL = {
  name: "submit_topic_ideas",
  description:
    "Submit a list of YouTube video topic ideas tailored to the user's niche. Call exactly once.",
  input_schema: {
    type: "object" as const,
    properties: {
      ideas: {
        type: "array",
        minItems: 3,
        maxItems: 8,
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "YouTube-style title (≤ 80 chars). Hook on the payoff." },
            hook: { type: "string", description: "First 1-2 sentences the video opens with (~20 words). Must land in 5 seconds." },
            angle: { type: "string", description: "1-sentence summary of the unique angle that makes this video different from the obvious version." },
            estDurationMin: { type: "number", description: "Suggested target duration in minutes (3-25)." },
          },
          required: ["title", "hook", "angle", "estDurationMin"],
        },
      },
    },
    required: ["ideas"],
  },
};

const BRAINSTORM_SYSTEM = `You are a YouTube content strategist who has worked on channels with millions of subs. You're given a niche and you propose 3-6 fresh video ideas, each with a distinct angle. Avoid generic listicles ("10 tips for X") unless the angle is novel. Prefer:
- contrarian takes against common advice
- deep-dives into one specific case study, person, or event
- counter-intuitive insights backed by a surprising fact
- "how I did X" first-person framings

Call submit_topic_ideas exactly once. Don't return prose or commentary outside the tool call.`;

export async function brainstormTopics(opts: {
  niche: string;
  audience?: string;
  tone?: string;
  count?: number;
}): Promise<TopicIdea[]> {
  const c = await client();
  const model = await resolved.anthropicDefaultModel();
  const userMsg = [
    `Niche: ${opts.niche.trim()}`,
    opts.audience ? `Audience: ${opts.audience.trim()}` : null,
    opts.tone ? `Tone: ${opts.tone.trim()}` : null,
    `Propose ${opts.count ?? 5} video ideas. Call submit_topic_ideas exactly once.`,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await c.messages.create({
    model,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    tools: [BRAINSTORM_TOOL],
    tool_choice: { type: "auto" },
    system: [{ type: "text", text: BRAINSTORM_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMsg }],
  });

  for (const block of res.content) {
    if (block.type === "tool_use" && block.name === BRAINSTORM_TOOL.name) {
      const input = block.input as { ideas?: TopicIdea[] };
      if (input?.ideas && Array.isArray(input.ideas) && input.ideas.length > 0) {
        return input.ideas;
      }
    }
  }
  throw new Error(
    `Claude did not return topic ideas. stop_reason=${res.stop_reason ?? "unknown"}.`,
  );
}

// ---------------------------------------------------------------------------
// 1b. brainstormAndPickBest — single round-trip used by the channel scheduler.
//     Returns N ideas plus the index Claude rates as the strongest.
// ---------------------------------------------------------------------------

const BRAINSTORM_AND_PICK_TOOL = {
  name: "submit_topic_ideas_with_pick",
  description:
    "Submit topic ideas AND nominate the single best one to produce next. Call exactly once.",
  input_schema: {
    type: "object" as const,
    properties: {
      ideas: {
        type: "array",
        minItems: 3,
        maxItems: 8,
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "YouTube-style title (≤ 80 chars)." },
            hook: { type: "string", description: "First 1-2 sentences (~20 words). Lands in 5s." },
            angle: { type: "string", description: "1-sentence unique angle." },
            estDurationMin: { type: "number", description: "3-25 minutes." },
          },
          required: ["title", "hook", "angle", "estDurationMin"],
        },
      },
      bestIndex: {
        type: "integer",
        minimum: 0,
        description:
          "0-based index into `ideas` of the strongest pick (highest expected CTR × watch-time for this niche).",
      },
      bestRationale: {
        type: "string",
        description: "1-sentence explanation of why this idea wins over the others.",
      },
    },
    required: ["ideas", "bestIndex", "bestRationale"],
  },
};

export async function brainstormAndPickBest(opts: {
  niche: string;
  audience?: string;
  tone?: string;
  count?: number;
  /** Titles already produced for this channel — Claude is told to avoid
   *  repeating or paraphrasing any of them. Pass the most recent ~20-30. */
  avoidTitles?: string[];
}): Promise<{ ideas: TopicIdea[]; bestIndex: number; bestRationale: string }> {
  const c = await client();
  const model = await resolved.anthropicDefaultModel();
  const avoid = (opts.avoidTitles ?? []).map((t) => t.trim()).filter(Boolean);
  const userMsg = [
    `Niche: ${opts.niche.trim()}`,
    opts.audience ? `Audience: ${opts.audience.trim()}` : null,
    opts.tone ? `Tone: ${opts.tone.trim()}` : null,
    avoid.length > 0
      ? `Already produced for this channel — DO NOT repeat, paraphrase, or recycle the same topic, angle, or hook (cover genuinely different ground):\n${avoid.map((t) => `- ${t}`).join("\n")}`
      : null,
    `Propose ${opts.count ?? 5} video ideas. Then pick the single best one to produce next, weighing search demand, click-through potential, and feasibility. Call submit_topic_ideas_with_pick exactly once.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const res = await c.messages.create({
    model,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    tools: [BRAINSTORM_AND_PICK_TOOL],
    tool_choice: { type: "auto" },
    system: [{ type: "text", text: BRAINSTORM_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMsg }],
  });

  for (const block of res.content) {
    if (block.type === "tool_use" && block.name === BRAINSTORM_AND_PICK_TOOL.name) {
      const input = block.input as {
        ideas?: TopicIdea[];
        bestIndex?: number;
        bestRationale?: string;
      };
      if (
        Array.isArray(input.ideas) &&
        input.ideas.length > 0 &&
        typeof input.bestIndex === "number" &&
        input.bestIndex >= 0 &&
        input.bestIndex < input.ideas.length
      ) {
        return {
          ideas: input.ideas,
          bestIndex: input.bestIndex,
          bestRationale: input.bestRationale ?? "",
        };
      }
    }
  }
  throw new Error(
    `Claude did not return ideas with a pick. stop_reason=${res.stop_reason ?? "unknown"}.`,
  );
}

// ===========================================================================
// 2. writeFullScript
// ===========================================================================

const SCRIPT_TOOL = {
  name: "submit_full_script",
  description: "Return the full video script as plain text. Call exactly once.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "Final video title (≤ 80 chars)." },
      script: {
        type: "string",
        description:
          "The full narration script. Paragraphs separated by blank lines. No markdown headings, no bullet lists, no stage directions or section labels (Hook / Voiceover: / etc.). Plain narration only — every sentence will be read aloud by an AI voice.",
      },
    },
    required: ["title", "script"],
  },
};

const SCRIPT_SYSTEM = `You are a senior YouTube scriptwriter. Given a video topic, hook, and target duration, you write the FULL narration script that an AI voice will read aloud verbatim.

Style:
- Conversational, second-person ("you") when talking to the viewer.
- Punchy opening — the hook lands in the first 5 seconds.
- Concrete examples and specific numbers over abstract claims.
- Active voice.
- No throat-clearing ("Hey guys", "Today I want to talk about", "Did you know that…").

Structure:
- Open with the hook.
- 3-7 main beats, each ~30-90 seconds of narration.
- Close with a single concrete takeaway or call-to-action.

Length calibration (rough): 150 words = 1 minute of natural narration. So a 10-min video script ≈ 1500 words.

Output rules:
- Plain text only. No markdown headings. No bullet lists. No "[B-roll: …]" or stage directions.
- Paragraphs separated by blank lines. Each paragraph is one narrated beat.
- Do not narrate section labels like "Hook" or "Conclusion" — just write the words to be spoken.
- Call submit_full_script exactly once.`;

export async function writeFullScript(opts: {
  topic: string;
  hook?: string;
  angle?: string;
  lengthMin: number;
  tone?: string;
}): Promise<{ title: string; script: string }> {
  const c = await client();
  const model = await resolved.anthropicDefaultModel();
  const userMsg = [
    `Topic: ${opts.topic.trim()}`,
    opts.hook ? `Opening hook (rewrite if needed): ${opts.hook.trim()}` : null,
    opts.angle ? `Angle: ${opts.angle.trim()}` : null,
    `Target duration: ${opts.lengthMin} minutes (~${Math.round(opts.lengthMin * 150)} words).`,
    opts.tone ? `Tone: ${opts.tone.trim()}` : null,
    `Write the full script. Call submit_full_script exactly once.`,
  ]
    .filter(Boolean)
    .join("\n");

  // Long scripts can take a while — keep adaptive thinking on but bump effort
  // to high so the model invests in coherence across all beats.
  const res = await c.messages.create({
    model,
    max_tokens: 16_000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    tools: [SCRIPT_TOOL],
    tool_choice: { type: "auto" },
    system: [{ type: "text", text: SCRIPT_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMsg }],
  });

  for (const block of res.content) {
    if (block.type === "tool_use" && block.name === SCRIPT_TOOL.name) {
      const input = block.input as { title?: string; script?: string };
      if (input?.title && input?.script) return { title: input.title, script: input.script };
    }
  }
  // Fallback: pull script from a text block if Claude returned prose.
  for (const block of res.content) {
    if (block.type === "text" && block.text.trim().length > 200) {
      return { title: opts.topic.slice(0, 80), script: block.text.trim() };
    }
  }
  throw new Error(
    `Claude did not return a script. stop_reason=${res.stop_reason ?? "unknown"}.`,
  );
}

// ===========================================================================
// 3. generateSeoMetadata
// ===========================================================================

export type SeoMetadata = {
  title: string;
  description: string;
  tags: string[];
  hashtags: string[];
  thumbnailPrompt: string;
};

const SEO_TOOL = {
  name: "submit_seo_metadata",
  description: "Submit the YouTube upload metadata package. Call exactly once.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string", description: "YouTube title (≤ 80 chars). Hook on the payoff. Add the most-searched keyword near the front." },
      description: {
        type: "string",
        description: "YouTube description (200-800 words). First 2 lines are the most important — they show in search results above the fold. Include 2-3 paragraphs summarizing the video, key timestamps if applicable, and 5-10 line breaks of natural breathing room.",
      },
      tags: {
        type: "array",
        minItems: 8,
        maxItems: 25,
        items: { type: "string" },
        description: "Search tags. Lowercase. Mix broad and specific. No hashtags here.",
      },
      hashtags: {
        type: "array",
        minItems: 2,
        maxItems: 5,
        items: { type: "string", description: "Including the # prefix" },
        description: "Hashtags for the description (max 3 show above the title). Niche-relevant.",
      },
      thumbnailPrompt: {
        type: "string",
        description:
          "Prompt for an AI image generator to produce the thumbnail. Specify the subject, composition (centered face / text overlay area / contrast), and visual style. ≤ 200 chars.",
      },
    },
    required: ["title", "description", "tags", "hashtags", "thumbnailPrompt"],
  },
};

const SEO_SYSTEM = `You are a YouTube SEO specialist. Given a finished video script and a working title, you produce the metadata package the creator pastes into YouTube Studio at upload time.

Guidelines:
- Title: optimize for searchability AND click-through. Front-load the most-searched keyword. No clickbait punctuation.
- Description: first 2 lines visible above the fold — make them count. Then 2-3 paragraphs summarizing value, with natural keyword density. Don't keyword-stuff.
- Tags: mix 3-5 broad niche tags ("personal finance") with 5-15 specific long-tail ones ("compound interest calculator 2026"). Lowercase.
- Hashtags: 2-3 work well (max 3 show above the title). Niche-relevant.
- Thumbnail prompt: describe a CONCRETE image, not a vibe. Specify subject, composition, and contrast. Leave room for a text overlay if the title is long.

Call submit_seo_metadata exactly once.`;

export async function generateSeoMetadata(opts: {
  title: string;
  script: string;
}): Promise<SeoMetadata> {
  const c = await client();
  const model = await resolved.anthropicDefaultModel();

  const res = await c.messages.create({
    model,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
    tools: [SEO_TOOL],
    tool_choice: { type: "auto" },
    system: [{ type: "text", text: SEO_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Working title: ${opts.title}\n\nScript:\n"""\n${opts.script.slice(0, 16000)}\n"""\n\nProduce the SEO metadata. Call submit_seo_metadata exactly once.`,
      },
    ],
  });

  for (const block of res.content) {
    if (block.type === "tool_use" && block.name === SEO_TOOL.name) {
      const input = block.input as Partial<SeoMetadata>;
      if (input?.title && input?.description && input?.tags && input?.hashtags && input?.thumbnailPrompt) {
        return input as SeoMetadata;
      }
    }
  }
  throw new Error(
    `Claude did not return SEO metadata. stop_reason=${res.stop_reason ?? "unknown"}.`,
  );
}
