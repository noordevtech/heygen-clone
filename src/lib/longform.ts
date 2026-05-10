import { writeFile, mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateTts } from "./elevenlabs";
import { createSunoTask, waitForSuno } from "./kie-suno";
import { findMusicModel } from "./catalog";
import { composeLongform, ensureFfmpegAvailable, type SceneAsset } from "./ffmpeg";
import { uploadBuffer } from "./r2";
import { failJob, setStatus, updateJob } from "./jobs";
import type { LongformRequest } from "./types";

/**
 * Download a URL to disk with a hard wall-clock timeout. Uses both
 * AbortController (cancels the fetch) AND a Promise.race timeout (kicks in
 * even if the body read doesn't honor the abort signal — Node 20's fetch
 * occasionally hangs on arrayBuffer() despite a fired abort).
 */
async function downloadToFile(url: string, dest: string, timeoutMs = 30_000): Promise<void> {
  const ctrl = new AbortController();
  const start = Date.now();
  console.log(`[longform] download start ${url}`);

  const work = (async () => {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`Download failed (${res.status}) from ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(dest, buf);
  })();

  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      ctrl.abort();
      reject(new Error(`Download timed out after ${timeoutMs}ms: ${url}`));
    }, timeoutMs).unref();
  });

  try {
    await Promise.race([work, timeout]);
    console.log(`[longform] download done  ${url} (${Date.now() - start}ms)`);
  } catch (err) {
    console.error(`[longform] download fail  ${url} (${Date.now() - start}ms): ${(err as Error).message}`);
    throw err;
  }
}

export async function runLongformPipeline(jobId: string, req: LongformRequest): Promise<void> {
  if (!req.scenes.length) {
    await failJob(jobId, "Long-form job has no scenes");
    return;
  }

  // Fail fast if the worker container doesn't have ffmpeg installed (e.g. the
  // build image was cached before nixpacks.toml landed).
  try {
    await ensureFfmpegAvailable();
  } catch (err) {
    await failJob(jobId, err);
    return;
  }

  let cleanup: (() => Promise<void>) | null = null;

  try {
    const totalScenes = req.scenes.length;

    // 1) Per-scene narration. Done sequentially because ElevenLabs free/starter
    //    plans dislike bursty parallel calls.
    await setStatus(jobId, "tts", 5, `Synthesizing narration (0/${totalScenes})…`);
    const sceneAudio: { buffer: Buffer; contentType: string }[] = [];
    for (let i = 0; i < totalScenes; i++) {
      const r = await generateTts({
        voiceId: req.voiceId,
        text: req.scenes[i].text,
        modelId: req.voiceModelId,
      });
      sceneAudio.push({ buffer: r.audio, contentType: r.contentType });
      const pct = 5 + Math.round(((i + 1) / totalScenes) * 25);
      await setStatus(jobId, "tts", pct, `Synthesizing narration (${i + 1}/${totalScenes})…`);
    }

    // 2) Optional background music — kicked off in parallel so it overlaps
    //    with B-roll downloads.
    let musicPromise: Promise<{ urls: string[] } | null> = Promise.resolve(null);
    if (req.generateMusic && req.musicModelId) {
      const model = findMusicModel(req.musicModelId);
      if (!model) throw new Error(`Unknown music model: ${req.musicModelId}`);
      const prompt =
        (req.musicPrompt && req.musicPrompt.trim()) ||
        `Cinematic background score, ${req.scenes.length} scenes, supports voiceover, ambient.`;
      musicPromise = (async () => {
        const taskId = await createSunoTask({
          model: model.slug,
          prompt,
          instrumental: req.musicInstrumental ?? true,
        });
        return waitForSuno(taskId);
      })();
    }

    // 3) Stage scene assets to /tmp. Downloads run in parallel — one slow
    //    Pexels edge no longer blocks the rest.
    const stageDir = await mkdtemp(join(tmpdir(), "longform-stage-"));
    const sceneAssets: SceneAsset[] = await Promise.all(
      req.scenes.map(async (scene, i) => {
        const idx = String(i).padStart(4, "0");
        const audioPath = join(stageDir, `audio-${idx}.mp3`);
        const imagePath = join(stageDir, `image-${idx}.jpg`);
        await writeFile(audioPath, sceneAudio[i].buffer);
        await setStatus(
          jobId,
          "compositing",
          35,
          `Downloading B-roll for scene ${i + 1}/${totalScenes}…`,
        );

        const captionText = req.burnCaptions ? scene.text : undefined;
        const useVideo = scene.mediaType === "video" && scene.videoUrl;
        if (useVideo) {
          const videoPath = join(stageDir, `video-${idx}.mp4`);
          try {
            await downloadToFile(scene.videoUrl!, videoPath, 60_000);
            // Optional poster fallback — non-fatal if missing.
            try {
              await downloadToFile(scene.imageUrl, imagePath);
            } catch {
              /* ignore — video is what we'll use */
            }
            return { audioPath, imagePath, videoPath, captionText };
          } catch (err) {
            console.warn(
              `[longform] video download failed for scene ${i + 1}, falling back to image: ${(err as Error).message}`,
            );
          }
        }

        await downloadToFile(scene.imageUrl, imagePath);
        return { audioPath, imagePath, captionText };
      }),
    );

    // 4) Resolve background music. Suno usually finishes around the same time
    //    as the downloads but can take 1–3 minutes — show that explicitly so
    //    the UI doesn't look frozen.
    let bgmPath: string | undefined;
    if (req.generateMusic) {
      await setStatus(jobId, "music", 50, "Waiting for background music…");
    }
    const musicResult = await musicPromise;
    if (musicResult && musicResult.urls.length) {
      bgmPath = join(stageDir, "bgm.mp3");
      await downloadToFile(musicResult.urls[0], bgmPath);
      await updateJob(jobId, { musicUrl: musicResult.urls[0] });
    }

    // 5) Composite via ffmpeg.
    await setStatus(jobId, "compositing", 65, `Compositing ${totalScenes} scenes with ffmpeg…`);
    const compose = await composeLongform({
      scenes: sceneAssets,
      bgmPath,
      width: req.width ?? 1920,
      height: req.height ?? 1080,
      transitions: req.transitions,
      colorGrade: req.colorGrade,
      burnCaptions: req.burnCaptions,
      duckMusic: req.duckMusic,
      scenePauseSec: req.scenePauseSec,
      titleCard:
        req.titleCard?.enabled
          ? {
              text: req.titleCard.text || req.title || "",
              durationSec: req.titleCard.durationSec,
            }
          : undefined,
      outroCard:
        req.outroCard?.enabled
          ? { text: req.outroCard.text || "Thanks for watching", durationSec: req.outroCard.durationSec }
          : undefined,
    });
    cleanup = compose.cleanup;

    // 6) Upload final MP4 to R2.
    await setStatus(jobId, "uploading", 90, "Uploading final video to storage…");
    const finalBytes = await readFile(compose.videoPath);
    const upload = await uploadBuffer(`longform/${jobId}/final.mp4`, finalBytes, "video/mp4");

    await updateJob(jobId, {
      status: "done",
      progress: 100,
      message: `Ready · ${Math.round(compose.durationSec)}s`,
      videoUrl: upload.url,
    });
  } catch (err) {
    await failJob(jobId, err);
  } finally {
    if (cleanup) await cleanup();
  }
}
