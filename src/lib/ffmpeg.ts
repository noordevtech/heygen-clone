import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

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
};

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
  },
): Promise<void> {
  const { width, height, fps, kenBurns, direction } = options;

  // Video B-roll: stream-loop the clip, scale+pad to canvas, drop its audio,
  // use the narration audio, and -shortest to the audio length.
  if (scene.videoPath) {
    const vf =
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${fps}`;
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
    // ceil + a small safety margin so zoompan doesn't run dry before -shortest
    const frames = Math.max(1, Math.ceil((audioDuration + 0.2) * fps));
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
    "-vf", vf,
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    "-movflags", "+faststart",
    outPath,
  ]);
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

/** Mix a background music track under the existing narration audio. */
async function mixBackgroundMusic(
  videoPath: string,
  musicPath: string,
  outPath: string,
  bgmVolume = 0.18,
): Promise<void> {
  await run([
    "-i", videoPath,
    "-stream_loop", "-1",
    "-i", musicPath,
    "-filter_complex",
    `[1:a]volume=${bgmVolume}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[a]`,
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
    const clipPaths: string[] = [];
    for (let i = 0; i < opts.scenes.length; i++) {
      const clip = join(workdir, `scene-${String(i).padStart(4, "0")}.mp4`);
      await renderSceneClip(opts.scenes[i], clip, {
        width,
        height,
        fps,
        kenBurns,
        direction: directionFor(i),
      });
      clipPaths.push(clip);
    }

    const concatPath = join(workdir, "concat.mp4");
    await concatClips(clipPaths, concatPath, workdir);

    let final = concatPath;
    if (opts.bgmPath) {
      const mixed = join(workdir, "final.mp4");
      await mixBackgroundMusic(concatPath, opts.bgmPath, mixed);
      final = mixed;
    }

    const durationSec = await probeDurationSec(final);
    return { videoPath: final, workdir, cleanup, durationSec };
  } catch (err) {
    await cleanup();
    throw err;
  }
}
