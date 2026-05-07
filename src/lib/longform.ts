import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { generateTts } from "./elevenlabs";
import { createSunoTask, waitForSuno } from "./kie-suno";
import { findMusicModel } from "./catalog";
import { composeLongform, type SceneAsset } from "./ffmpeg";
import { uploadBuffer } from "./r2";
import { failJob, setStatus, updateJob } from "./jobs";
import type { LongformRequest } from "./types";

async function downloadToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) from ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

export async function runLongformPipeline(jobId: string, req: LongformRequest): Promise<void> {
  if (!req.scenes.length) {
    await failJob(jobId, "Long-form job has no scenes");
    return;
  }

  let cleanup: (() => Promise<void>) | null = null;

  try {
    const totalScenes = req.scenes.length;

    // 1) Per-scene narration. Done sequentially because ElevenLabs free/starter
    //    plans dislike bursty parallel calls.
    await setStatus(jobId, "tts", 5, `Synthesizing narration (${totalScenes} scenes)…`);
    const sceneAudio: { buffer: Buffer; contentType: string }[] = [];
    for (let i = 0; i < totalScenes; i++) {
      const r = await generateTts({
        voiceId: req.voiceId,
        text: req.scenes[i].text,
        modelId: req.voiceModelId,
      });
      sceneAudio.push({ buffer: r.audio, contentType: r.contentType });
      const pct = 5 + Math.round(((i + 1) / totalScenes) * 25);
      await setStatus(
        jobId,
        "tts",
        pct,
        `Synthesizing narration (${i + 1}/${totalScenes})…`,
      );
    }

    // 2) Optional background music — kicked off in parallel with downloads.
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

    // 3) Stage scene assets to /tmp.
    await setStatus(jobId, "compositing", 35, "Downloading B-roll and staging assets…");
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const stageDir = await mkdtemp(join(tmpdir(), "longform-stage-"));
    const sceneAssets: SceneAsset[] = [];
    for (let i = 0; i < totalScenes; i++) {
      const idx = String(i).padStart(4, "0");
      const audioPath = join(stageDir, `audio-${idx}.mp3`);
      const imagePath = join(stageDir, `image-${idx}.jpg`);
      await writeFile(audioPath, sceneAudio[i].buffer);
      await downloadToFile(req.scenes[i].imageUrl, imagePath);
      sceneAssets.push({ audioPath, imagePath });
    }

    // 4) Resolve background music if requested.
    let bgmPath: string | undefined;
    const musicResult = await musicPromise;
    if (musicResult && musicResult.urls.length) {
      bgmPath = join(stageDir, "bgm.mp3");
      await downloadToFile(musicResult.urls[0], bgmPath);
      await updateJob(jobId, { musicUrl: musicResult.urls[0] });
    }

    // 5) Composite via ffmpeg.
    await setStatus(jobId, "compositing", 60, "Compositing video with ffmpeg…");
    const compose = await composeLongform({
      scenes: sceneAssets,
      bgmPath,
      width: req.width ?? 1920,
      height: req.height ?? 1080,
    });
    cleanup = compose.cleanup;

    // 6) Upload final MP4 to R2.
    await setStatus(jobId, "uploading", 88, "Uploading final video to storage…");
    const { readFile } = await import("node:fs/promises");
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
