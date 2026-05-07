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
  imagePath: string;
  audioPath: string;
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

/** Build a single scene clip: still image scaled+padded to 1080p, audio underlaid. */
async function renderSceneClip(
  scene: SceneAsset,
  outPath: string,
  options: { width: number; height: number; fps: number },
): Promise<void> {
  const { width, height, fps } = options;
  await run([
    "-loop", "1",
    "-i", scene.imagePath,
    "-i", scene.audioPath,
    "-c:v", "libx264",
    "-tune", "stillimage",
    "-pix_fmt", "yuv420p",
    "-r", String(fps),
    "-vf",
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`,
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    "-movflags", "+faststart",
    outPath,
  ]);
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
    const clipPaths: string[] = [];
    for (let i = 0; i < opts.scenes.length; i++) {
      const clip = join(workdir, `scene-${String(i).padStart(4, "0")}.mp4`);
      await renderSceneClip(opts.scenes[i], clip, { width, height, fps });
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
