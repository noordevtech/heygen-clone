/**
 * Split a long-form script into scenes. We treat each paragraph (run of text
 * separated by blank lines) as a scene; if a paragraph is too long for one
 * shot, split on sentence boundaries.
 */

const HARD_LIMIT_CHARS = 320;

export type ParsedScene = {
  text: string;
  /** Auto-suggested keywords that the user can edit before searching Pexels. */
  keywords: string;
};

const STOPWORDS = new Set(
  "the a an of and or to in on at for with by from is are was were be been being am do does did this that those these those it its their our your his her my we you they i as but if so than then them there here when where what who whom which how why over under above below into onto off up down out about against between within without while because each more most very just also only than".split(
    /\s+/,
  ),
);

function topKeywords(text: string, n = 5): string {
  const counts = new Map<string, number>();
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([w]) => w)
    .join(" ");
}

function splitLongParagraph(p: string): string[] {
  const sentences = p
    .replace(/\s+/g, " ")
    .trim()
    .match(/[^.!?]+[.!?]+(\s|$)|.+$/g) ?? [p];
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    const candidate = buf ? `${buf} ${s.trim()}` : s.trim();
    if (candidate.length > HARD_LIMIT_CHARS && buf) {
      out.push(buf);
      buf = s.trim();
    } else {
      buf = candidate;
    }
  }
  if (buf) out.push(buf);
  return out;
}

export function parseScenes(script: string): ParsedScene[] {
  const paragraphs = script
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const scenes: ParsedScene[] = [];
  for (const p of paragraphs) {
    for (const chunk of splitLongParagraph(p)) {
      scenes.push({ text: chunk, keywords: topKeywords(chunk) });
    }
  }
  return scenes;
}
