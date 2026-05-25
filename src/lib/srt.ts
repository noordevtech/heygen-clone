import type { LongformScene } from "./types";

/**
 * Build an SRT caption file from per-scene narration text + per-scene audio
 * durations. The pipeline persists ffprobed durations onto the job request
 * after TTS so the timings here are accurate to the rendered MP4.
 *
 * If durations are missing (e.g. probe failed), we fall back to estimating
 * from word count at the standard narration rate (~2.5 wps), which is what
 * the script generator already assumes.
 *
 * Each scene becomes one SRT cue. Long scene text isn't auto-split into
 * sub-cues here; if you want sentence-level caption flow, do the split
 * upstream when planning scenes.
 */
export function buildSceneSrt(opts: {
  scenes: LongformScene[];
  /** Per-scene durations in seconds, parallel to `scenes`. Missing → estimate. */
  durationsSec?: number[];
  /** Silence padded after each scene in the rendered MP4. Default 0.4s — must
   *  match the value used by ffmpeg.composeLongform for accurate alignment. */
  scenePauseSec?: number;
  /** Maximum chars per SRT cue line — long scene text gets wrapped on word
   *  boundaries so YouTube doesn't truncate display. */
  maxLineChars?: number;
}): string {
  const pause = opts.scenePauseSec ?? 0.4;
  const maxLine = opts.maxLineChars ?? 42;
  let cursor = 0;
  const lines: string[] = [];

  opts.scenes.forEach((scene, i) => {
    const dur =
      opts.durationsSec?.[i] && Number.isFinite(opts.durationsSec[i])
        ? opts.durationsSec[i]
        : estimateNarrationSec(scene.text);
    const start = cursor;
    const end = cursor + dur;
    lines.push(String(i + 1));
    lines.push(`${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}`);
    lines.push(wrapForCaption(scene.text, maxLine));
    lines.push("");
    // Pad silence after the cue, except the last scene which the composer
    // doesn't pad (ffmpeg.composeLongform skips trailing apad).
    cursor = end + (i === opts.scenes.length - 1 ? 0 : pause);
  });

  return lines.join("\n");
}

function estimateNarrationSec(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  // ~2.5 words per second matches typical ElevenLabs narration pacing and
  // matches the 150 wpm assumption baked into our script generator.
  return Math.max(1.5, words / 2.5);
}

function formatSrtTimestamp(totalSec: number): string {
  const ms = Math.max(0, Math.round(totalSec * 1000));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1_000);
  const millis = ms % 1_000;
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(millis, 3)}`;
}

function pad(n: number, width: number): string {
  return n.toString().padStart(width, "0");
}

/**
 * Soft-wrap caption text on word boundaries so each line stays under
 * `maxChars`. Preserves the original word order; doesn't break words.
 */
function wrapForCaption(text: string, maxChars: number): string {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    if (!current.length) {
      current = w;
      continue;
    }
    if (current.length + 1 + w.length > maxChars) {
      lines.push(current);
      current = w;
    } else {
      current += " " + w;
    }
  }
  if (current.length) lines.push(current);
  return lines.join("\n");
}
