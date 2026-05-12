import { spawn } from "node:child_process";
import { mkdir, writeFile, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type { ColorGrade } from "./types";

/**
 * Lightweight ffmpeg wrapper used by the longform pipeline. We shell out to
 * the `ffmpeg` binary (provisioned via nixpacks.toml) instead of pulling
 * fluent-ffmpeg as a dep.
 */

export type SceneAsset = {
  audioPath: string;
  /** Still image source. When `videoPath` is also set, the video wins and the
   *  image is unused (kept as a fallback during staging). */
  imagePath: string;
  /** Optional pre-shot video B-roll. Looped + trimmed to audio length. */
  videoPath?: string;
  /** Optional caption text for the scene. Burned in when `burnCaptions` is set. */
  captionText?: string;
};

/**
 * Map a color-grade preset to an ffmpeg filter chain. Empty string means no
 * grading.
 */
export function colorGradeFilter(grade: ColorGrade | undefined): string {
  switch (grade) {
    case "cinematic":
      return "curves=preset=increase_contrast,eq=contrast=1.08:saturation=0.85,colorbalance=rs=0.04:bs=-0.04";
    case "warm":
      return "colorbalance=rs=0.10:gs=0.04:bs=-0.10,eq=saturation=1.10";
    case "cool":
      return "colorbalance=rs=-0.10:gs=0.00:bs=0.15,eq=saturation=1.05";
    case "bw":
      return "hue=s=0,eq=contrast=1.10";
    case "none":
    default:
      return "";
  }
}

/**
 * Find a usable TTF on disk. Most container images carry DejaVu; we fall back
 * gracefully to undefined and the caller skips drawtext rather than crashing.
 */
let cachedFontPath: string | null | undefined;
async function resolveFontPath(): Promise<string | null> {
  if (cachedFontPath !== undefined) return cachedFontPath;
  const candidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    "/nix/var/nix/profiles/default/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  ];
  for (const p of candidates) {
    try {
      await access(p);
      cachedFontPath = p;
      return p;
    } catch {
      /* try next */
    }
  }
  cachedFontPath = null;
  return null;
}

/** Escape a string for use as an ffmpeg filtergraph option value (text=, etc). */
function escapeFilterText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

/**
 * Build a drawtext filter that renders `text` as a caption at the bottom of
 * the frame with a translucent box. Returns "" if no font is available.
 */
async function captionDrawtext(text: string, height: number): Promise<string> {
  const font = await resolveFontPath();
  if (!font) return "";
  const fontSize = Math.max(28, Math.round(height / 22));
  return [
    `drawtext=fontfile='${font.replace(/'/g, "\\'")}'`,
    `text='${escapeFilterText(text)}'`,
    `fontsize=${fontSize}`,
    `fontcolor=white`,
    `box=1`,
    `boxcolor=black@0.55`,
    `boxborderw=18`,
    `line_spacing=8`,
    `x=(w-text_w)/2`,
    `y=h-text_h-${Math.round(height / 14)}`,
  ].join(":");
}

/**
 * Verify ffmpeg + ffprobe are on the PATH. Used as a pre-flight in the
 * longform pipeline so a missing binary fails fast with a readable error
 * rather than a timeout.
 */
export async function ensureFfmpegAvailable(): Promise<void> {
  for (const bin of ["ffmpeg", "ffprobe"] as const) {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(bin, ["-version"], { stdio: "ignore" });
      proc.on("error", () =>
        reject(
          new Error(
            `${bin} is not installed in the worker container. ` +
              `Make sure nixpacks.toml is present at the repo root and that the worker service ` +
              `was rebuilt after it was added (Railway sometimes caches the build image — ` +
              `redeploy with the cache cleared).`,
          ),
        ),
      );
      proc.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`${bin} -version exited ${code}`)),
      );
    });
  }
}

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (b) => (stderr += b.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.trim().slice(-2000)}`));
    });
  });
}

export async function probeDurationSec(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    proc.stdout.on("data", (b) => (out += b.toString()));
    proc.stderr.on("data", (b) => (err += b.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}: ${err}`));
      const n = Number.parseFloat(out.trim());
      resolve(Number.isFinite(n) ? n : 0);
    });
  });
}

type Direction = "in" | "out" | "left" | "right";

/**
 * Build the Ken Burns video filter. We pre-scale the image to a higher
 * resolution before zoompan to avoid pixelation as the zoom climbs, then
 * crop the final frame back to the target output size with letterboxing
 * preserved when source aspect doesn't match.
 *
 * `frames` is the total number of output frames the scene should run for.
 * zoompan emits one frame per input frame when d=1, so we feed it a virtual
 * `framerate` matching `fps` and let -shortest cut at audio length.
 */
function kenBurnsFilter(
  width: number,
  height: number,
  fps: number,
  frames: number,
  direction: Direction,
): string {
  // Slow zoom: 1.0 → 1.25 over the full duration.
  const zoomMax = 1.25;
  const step = Math.max(0.0005, (zoomMax - 1) / Math.max(frames, 1));

  let zExpr: string;
  let xExpr: string;
  let yExpr: string;

  switch (direction) {
    case "out":
      // start zoomed in (1.25) and zoom out to 1.0
      zExpr = `if(eq(on,1),${zoomMax},max(zoom-${step.toFixed(6)},1.0))`;
      xExpr = "iw/2-(iw/zoom/2)";
      yExpr = "ih/2-(ih/zoom/2)";
      break;
    case "left":
      // pan from left to right at 1.1x zoom
      zExpr = "1.1";
      xExpr = `(iw-iw/zoom)*on/${frames}`;
      yExpr = "ih/2-(ih/zoom/2)";
      break;
    case "right":
      zExpr = "1.1";
      xExpr = `(iw-iw/zoom)*(1-on/${frames})`;
      yExpr = "ih/2-(ih/zoom/2)";
      break;
    case "in":
    default:
      // 1.0 → 1.25 zoom in, centered
      zExpr = `min(zoom+${step.toFixed(6)},${zoomMax})`;
      xExpr = "iw/2-(iw/zoom/2)";
      yExpr = "ih/2-(ih/zoom/2)";
      break;
  }

  // Pre-scale to ~3x output width to keep the zoomed crop sharp.
  const baseW = width * 3;
  return [
    `scale=${baseW}:-2:flags=lanczos`,
    `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=${frames}:s=${width}x${height}:fps=${fps}`,
    `setsar=1`,
  ].join(",");
}

/** Build a single scene clip with optional Ken Burns motion. */
async function renderSceneClip(
  scene: SceneAsset,
  outPath: string,
  options: {
    width: number;
    height: number;
    fps: number;
    kenBurns: boolean;
    direction: Direction;
    colorGrade?: ColorGrade;
    burnCaptions?: boolean;
    /** Seconds of silence appended after the narration so scenes don't run
     *  back-to-back. The still image (or Ken Burns motion) keeps holding for
     *  this duration because -shortest matches the longer audio. */
    scenePauseSec?: number;
  },
): Promise<void> {
  const {
    width,
    height,
    fps,
    kenBurns,
    direction,
    colorGrade,
    burnCaptions,
    scenePauseSec = 0,
  } = options;

  const tail: string[] = [];
  const grade = colorGradeFilter(colorGrade);
  if (grade) tail.push(grade);
  if (burnCaptions && scene.captionText) {
    const dt = await captionDrawtext(scene.captionText, height);
    if (dt) tail.push(dt);
  }
  const tailVf = tail.length ? "," + tail.join(",") : "";

  const audioFilter =
    scenePauseSec > 0 ? ["-af", `apad=pad_dur=${scenePauseSec.toFixed(3)}`] : [];

  // Video B-roll: stream-loop the clip, scale+pad to canvas, drop its audio,
  // use the narration audio, and -shortest to the audio length.
  if (scene.videoPath) {
    const vf =
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:setsar=1,fps=${fps}` +
      tailVf;
    await run([
      "-stream_loop", "-1",
      "-i", scene.videoPath,
      "-i", scene.audioPath,
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-c:v", "libx264",
      "-tune", "film",
      "-pix_fmt", "yuv420p",
      "-r", String(fps),
      "-vf", vf,
      ...audioFilter,
      "-c:a", "aac",
      "-b:a", "192k",
      "-shortest",
      "-movflags", "+faststart",
      outPath,
    ]);
    return;
  }

  let vf: string;
  if (kenBurns) {
    const audioDuration = await probeDurationSec(scene.audioPath);
    // ceil + a small safety margin so zoompan doesn't run dry before -shortest.
    // Include scenePauseSec so the motion continues through the silent tail.
    const totalSec = audioDuration + scenePauseSec + 0.2;
    const frames = Math.max(1, Math.ceil(totalSec * fps));
    vf = kenBurnsFilter(width, height, fps, frames, direction);
  } else {
    vf =
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
  }

  await run([
    "-loop", "1",
    "-framerate", String(fps),
    "-i", scene.imagePath,
    "-i", scene.audioPath,
    "-c:v", "libx264",
    "-tune", kenBurns ? "film" : "stillimage",
    "-pix_fmt", "yuv420p",
    "-r", String(fps),
    "-vf", vf + tailVf,
    ...audioFilter,
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    "-movflags", "+faststart",
    outPath,
  ]);
}

/**
 * Render a black title/outro card with centered text and a soft fade in/out.
 * No external image needed; uses ffmpeg's `color` lavfi source.
 */
async function renderTitleCard(
  text: string,
  outPath: string,
  options: { width: number; height: number; fps: number; durationSec: number },
): Promise<void> {
  const { width, height, fps, durationSec } = options;
  const font = await resolveFontPath();
  const lines = wrapText(text, 28);
  const big = Math.max(48, Math.round(height / 12));
  const fadeFrames = Math.min(15, Math.round(fps * 0.5));
  const totalFrames = Math.max(1, Math.round(durationSec * fps));

  const vfParts: string[] = [`format=yuv420p`];
  if (font) {
    const fontPath = font.replace(/'/g, "\\'");
    lines.forEach((line, i) => {
      const offset = (i - (lines.length - 1) / 2) * Math.round(big * 1.25);
      vfParts.push(
        [
          `drawtext=fontfile='${fontPath}'`,
          `text='${escapeFilterText(line)}'`,
          `fontsize=${big}`,
          `fontcolor=white`,
          `x=(w-text_w)/2`,
          `y=(h-text_h)/2+(${offset})`,
        ].join(":"),
      );
    });
  }
  vfParts.push(`fade=t=in:st=0:d=${(fadeFrames / fps).toFixed(3)}`);
  vfParts.push(
    `fade=t=out:st=${(durationSec - fadeFrames / fps).toFixed(3)}:d=${(fadeFrames / fps).toFixed(3)}`,
  );

  await run([
    "-f", "lavfi", "-i", `color=c=black:s=${width}x${height}:d=${durationSec}:r=${fps}`,
    "-f", "lavfi", "-i", `anullsrc=channel_layout=stereo:sample_rate=44100`,
    "-shortest",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-r", String(fps),
    "-vf", vfParts.join(","),
    "-c:a", "aac",
    "-b:a", "192k",
    "-frames:v", String(totalFrames),
    "-movflags", "+faststart",
    outPath,
  ]);
}

function wrapText(text: string, maxLineLen: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) {
      cur = w;
      continue;
    }
    if ((cur + " " + w).length > maxLineLen) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur + " " + w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text];
}

/**
 * Pick a Ken Burns direction per scene index so the motion varies across
 * the video instead of always zooming the same way. The cycle is
 * in → out → left → right → in → out … starting with 'in'.
 */
function directionFor(i: number): Direction {
  return (["in", "out", "left", "right"] as const)[i % 4];
}

/** Concatenate a list of mp4s. Re-encodes audio for safe concat across heterogeneous inputs. */
async function concatClips(inputs: string[], outPath: string, workdir: string): Promise<void> {
  const listFile = join(workdir, "concat.txt");
  await writeFile(
    listFile,
    inputs.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
    "utf8",
  );
  // copy is fast but requires identical encodings — since we render every clip
  // with the same parameters above, copy works.
  await run(["-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", outPath]);
}

/**
 * Maximum number of input clips we'll pass to a single ffmpeg xfade invocation.
 * Each input opens its own h264 decoder with its own threads + FDs; on small
 * containers (Railway) ~50+ inputs trip `pthread_create` with EAGAIN,
 * surfacing as "Resource temporarily unavailable" from the filtergraph init.
 * We chunk longer scene lists and recursively crossfade the chunk outputs.
 */
const XFADE_CHUNK_SIZE = 16;

/** One-pass xfade over a small batch of clips. Caller guarantees inputs.length >= 2. */
async function crossfadeChunk(
  inputs: string[],
  outPath: string,
  options: { transitionSec: number; fps: number },
): Promise<void> {
  const { transitionSec, fps } = options;

  const durations: number[] = [];
  for (const p of inputs) durations.push(await probeDurationSec(p));

  const args: string[] = [];
  // `-threads 1` per input keeps each decoder single-threaded so we don't
  // blow past the container's pthread limit when stitching many clips.
  for (const p of inputs) args.push("-threads", "1", "-i", p);

  const filter: string[] = [];
  let prevV = "[0:v]";
  let prevA = "[0:a]";
  let cumulative = durations[0];
  for (let i = 1; i < inputs.length; i++) {
    const offset = Math.max(0, cumulative - transitionSec);
    const vOut = i === inputs.length - 1 ? "[vout]" : `[v${i}]`;
    const aOut = i === inputs.length - 1 ? "[aout]" : `[a${i}]`;
    filter.push(
      `${prevV}[${i}:v]xfade=transition=fade:duration=${transitionSec}:offset=${offset.toFixed(3)}${vOut}`,
    );
    filter.push(`${prevA}[${i}:a]acrossfade=d=${transitionSec}${aOut}`);
    prevV = vOut;
    prevA = aOut;
    cumulative = cumulative + durations[i] - transitionSec;
  }

  args.push(
    "-filter_complex", filter.join(";"),
    "-map", "[vout]",
    "-map", "[aout]",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-r", String(fps),
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    outPath,
  );
  await run(args);
}

/**
 * Crossfade a list of clips together with `xfade` (video) and `acrossfade`
 * (audio). Each transition shaves `transitionSec` off the total duration.
 * Re-encodes — xfade is filter-graph-only.
 *
 * For long videos (>XFADE_CHUNK_SIZE clips) we crossfade in batches and then
 * crossfade the batch outputs together, so we never feed ffmpeg more than
 * XFADE_CHUNK_SIZE simultaneous decoders. This keeps every individual ffmpeg
 * invocation under the container's thread/FD ceiling.
 */
async function crossfadeClips(
  inputs: string[],
  outPath: string,
  options: { transitionSec: number; fps: number },
): Promise<void> {
  if (inputs.length === 0) throw new Error("crossfadeClips: no inputs");
  if (inputs.length === 1) {
    await run(["-i", inputs[0], "-c", "copy", outPath]);
    return;
  }

  if (inputs.length <= XFADE_CHUNK_SIZE) {
    await crossfadeChunk(inputs, outPath, options);
    return;
  }

  // Split into batches, crossfade each batch, then recurse on the batch outputs.
  const workdir = join(tmpdir(), `xfade-${randomUUID()}`);
  await mkdir(workdir, { recursive: true });
  try {
    const batchOutputs: string[] = [];
    for (let start = 0; start < inputs.length; start += XFADE_CHUNK_SIZE) {
      const slice = inputs.slice(start, start + XFADE_CHUNK_SIZE);
      const batchIdx = batchOutputs.length;
      if (slice.length === 1) {
        // Lone trailing clip — keep as-is for the next recursion level.
        batchOutputs.push(slice[0]);
        continue;
      }
      const batchOut = join(workdir, `batch-${String(batchIdx).padStart(4, "0")}.mp4`);
      await crossfadeChunk(slice, batchOut, options);
      batchOutputs.push(batchOut);
    }
    await crossfadeClips(batchOutputs, outPath, options);
  } finally {
    try {
      await rm(workdir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Mix a background music track under the existing narration audio. When
 * `duck` is true, sidechain-compresses the music with the narration as the
 * key, so music gets out of the way during speech. Music also gets a 2 s
 * fade-in and fade-out at the boundaries.
 */
async function mixBackgroundMusic(
  videoPath: string,
  musicPath: string,
  outPath: string,
  options: { bgmVolume?: number; duck?: boolean } = {},
): Promise<void> {
  const bgmVolume = options.bgmVolume ?? 0.22;
  const duck = options.duck ?? true;

  const totalDur = await probeDurationSec(videoPath);
  const fadeOutStart = Math.max(0, totalDur - 2);

  // Music gets volume + fade in/out.
  const bgmChain =
    `[1:a]volume=${bgmVolume},afade=t=in:st=0:d=2,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=2[bgm]`;

  let filter: string;
  if (duck) {
    // Split narration: one copy mixed in, one copy used as the sidechain key.
    filter =
      `${bgmChain};` +
      `[0:a]asplit=2[main][key];` +
      `[bgm][key]sidechaincompress=threshold=0.04:ratio=8:attack=5:release=300[ducked];` +
      `[main][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`;
  } else {
    filter =
      `${bgmChain};` +
      `[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[a]`;
  }

  await run([
    "-i", videoPath,
    "-stream_loop", "-1",
    "-i", musicPath,
    "-filter_complex", filter,
    "-map", "0:v",
    "-map", "[a]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    "-movflags", "+faststart",
    outPath,
  ]);
}

export type ComposeOptions = {
  scenes: SceneAsset[];
  /** Optional background music file path. If set, mixed under the narration. */
  bgmPath?: string;
  width?: number;
  height?: number;
  fps?: number;
  /** Apply Ken Burns zoom/pan motion to each still image. Default true. */
  kenBurns?: boolean;
  /** Color grading preset applied to every scene clip. Default "none". */
  colorGrade?: ColorGrade;
  /** Burn each scene's caption text at the bottom of the frame. */
  burnCaptions?: boolean;
  /** Transition between scene clips. Default "crossfade". */
  transitions?: "none" | "crossfade";
  /** Sidechain-duck the background music under speech. Default true. */
  duckMusic?: boolean;
  /** Optional intro card prepended before the first scene. */
  titleCard?: { text: string; durationSec?: number };
  /** Optional outro card appended after the last scene. */
  outroCard?: { text: string; durationSec?: number };
  /** Seconds of silence padded after each scene's narration so cuts don't
   *  feel rushed. The image / Ken Burns motion holds through the pause. */
  scenePauseSec?: number;
};

export type ComposeResult = {
  videoPath: string;
  workdir: string;
  cleanup: () => Promise<void>;
  durationSec: number;
};

export async function composeLongform(opts: ComposeOptions): Promise<ComposeResult> {
  const width = opts.width ?? 1920;
  const height = opts.height ?? 1080;
  const fps = opts.fps ?? 30;

  const workdir = join(tmpdir(), `longform-${randomUUID()}`);
  await mkdir(workdir, { recursive: true });

  const cleanup = async () => {
    try {
      await rm(workdir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  };

  try {
    const kenBurns = opts.kenBurns ?? true;
    const transitions = opts.transitions ?? "crossfade";
    const clipPaths: string[] = [];

    if (opts.titleCard?.text) {
      const intro = join(workdir, "card-intro.mp4");
      await renderTitleCard(opts.titleCard.text, intro, {
        width,
        height,
        fps,
        durationSec: opts.titleCard.durationSec ?? 3,
      });
      clipPaths.push(intro);
    }

    // Default 0.4s of trailing silence per scene so cuts feel less rushed.
    // Skip the pause on the very last scene — no scene follows it, so the
    // silence would just delay the final cut.
    const scenePauseSec = opts.scenePauseSec ?? 0.4;
    for (let i = 0; i < opts.scenes.length; i++) {
      const clip = join(workdir, `scene-${String(i).padStart(4, "0")}.mp4`);
      await renderSceneClip(opts.scenes[i], clip, {
        width,
        height,
        fps,
        kenBurns,
        direction: directionFor(i),
        colorGrade: opts.colorGrade,
        burnCaptions: opts.burnCaptions,
        scenePauseSec: i < opts.scenes.length - 1 ? scenePauseSec : 0,
      });
      clipPaths.push(clip);
    }

    if (opts.outroCard?.text) {
      const outro = join(workdir, "card-outro.mp4");
      await renderTitleCard(opts.outroCard.text, outro, {
        width,
        height,
        fps,
        durationSec: opts.outroCard.durationSec ?? 3,
      });
      clipPaths.push(outro);
    }

    const concatPath = join(workdir, "concat.mp4");
    if (transitions === "crossfade" && clipPaths.length > 1) {
      await crossfadeClips(clipPaths, concatPath, { transitionSec: 0.5, fps });
    } else {
      await concatClips(clipPaths, concatPath, workdir);
    }

    let final = concatPath;
    if (opts.bgmPath) {
      const mixed = join(workdir, "final.mp4");
      await mixBackgroundMusic(concatPath, opts.bgmPath, mixed, {
        duck: opts.duckMusic ?? true,
      });
      final = mixed;
    }

    const durationSec = await probeDurationSec(final);
    return { videoPath: final, workdir, cleanup, durationSec };
  } catch (err) {
    await cleanup();
    throw err;
  }
}
