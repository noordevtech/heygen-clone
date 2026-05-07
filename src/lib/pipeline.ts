import { generateTts } from "./elevenlabs";
import { createVideo, waitForVideo } from "./openrouter";
import { createTask, waitForTask } from "./kie";
import { createSunoTask, waitForSuno } from "./kie-suno";
import { uploadBuffer, uploadFromUrl } from "./r2";
import { failJob, setStatus, updateJob } from "./jobs";
import {
  findVideoModel,
  findImageModel,
  findMusicModel,
  type VideoModelEntry,
} from "./catalog";
import type { GenerateRequest, AspectRatio } from "./types";

function buildVisualPrompt(req: GenerateRequest): string {
  if (req.visualPrompt && req.visualPrompt.trim().length > 0) return req.visualPrompt.trim();
  const base = req.script.replace(/\s+/g, " ").trim().slice(0, 500);
  if (req.avatar) {
    return `Photorealistic talking-head of a charismatic presenter speaking directly to camera, soft studio lighting, shallow depth of field, lips synced to provided audio. Speaker says: "${base}".`;
  }
  return `Cinematic b-roll illustrating: ${base}. Vibrant, social-media friendly, 24fps, high contrast.`;
}

const ALL_ASPECTS: AspectRatio[] = ["9:16", "1:1", "16:9"];

async function renderVideoAspect(
  jobId: string,
  req: GenerateRequest,
  aspect: AspectRatio,
  prompt: string,
  model: VideoModelEntry,
): Promise<{ aspect: AspectRatio; url: string }> {
  let providerVideoUrl: string;

  if (model.provider === "openrouter") {
    // OpenRouter accepts the slug directly via env-resolved openrouterX wrappers.
    const created = await createVideo({
      model: model.id === "openrouter:veo" ? "veo" : "seedance",
      prompt,
      aspect,
      durationSec: req.durationSec,
      generateAudio: req.avatar && !!model.audio,
    });
    const r = await waitForVideo(created);
    providerVideoUrl = r.videoUrl;
  } else {
    // Kie.ai common task API.
    // Field names follow the Kie.ai marketplace convention (camelCase, not
    // snake_case). Specific input keys vary slightly per model — we send a
    // permissive superset and rely on each model to ignore unknown keys.
    const taskId = await createTask({
      model: model.slug,
      input: {
        prompt,
        aspectRatio: aspect,
        duration: req.durationSec ?? 6,
        ...(req.avatar && model.audio ? { generateAudio: true } : {}),
      },
    });
    const r = await waitForTask(taskId, ["video"]);
    providerVideoUrl = r.urls[0];
  }

  const key = `video/${jobId}/${aspect.replace(":", "x")}.mp4`;
  const up = await uploadFromUrl(key, providerVideoUrl, "video/mp4");
  return { aspect, url: up.url };
}

async function generateCoverImage(jobId: string, req: GenerateRequest): Promise<string | null> {
  if (!req.generateImage || !req.imageModelId) return null;
  const model = findImageModel(req.imageModelId);
  if (!model) throw new Error(`Unknown image model: ${req.imageModelId}`);
  const prompt =
    (req.imagePrompt && req.imagePrompt.trim()) ||
    `Eye-catching social-media thumbnail for: ${req.script.slice(0, 200)}. Bold composition, high contrast, no text overlay.`;

  const taskId = await createTask({
    model: model.slug,
    input: { prompt, aspectRatio: req.aspect },
  });
  const { urls } = await waitForTask(taskId, ["image"]);
  const ext = (urls[0].match(/\.(png|jpe?g|webp|gif)/i)?.[1] ?? "jpg").toLowerCase();
  const ct = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";
  const up = await uploadFromUrl(`image/${jobId}/cover.${ext}`, urls[0], ct);
  return up.url;
}

async function generateMusic(jobId: string, req: GenerateRequest): Promise<string | null> {
  if (!req.generateMusic || !req.musicModelId) return null;
  const model = findMusicModel(req.musicModelId);
  if (!model) throw new Error(`Unknown music model: ${req.musicModelId}`);
  const prompt =
    (req.musicPrompt && req.musicPrompt.trim()) ||
    `Background score matching the mood of: ${req.script.slice(0, 200)}. Subtle, ambient, supports narration.`;

  // Music uses Kie.ai's dedicated Suno endpoint, not the common task API.
  const taskId = await createSunoTask({
    model: model.slug,
    prompt,
    instrumental: req.musicInstrumental ?? true,
  });
  const { urls } = await waitForSuno(taskId);
  const up = await uploadFromUrl(`music/${jobId}/track.mp3`, urls[0], "audio/mpeg");
  return up.url;
}

export async function runPipeline(jobId: string, req: GenerateRequest): Promise<void> {
  try {
    const videoModel = findVideoModel(req.videoModelId);
    if (!videoModel) throw new Error(`Unknown video model: ${req.videoModelId}`);

    // 1) Voiceover
    await setStatus(jobId, "tts", 8, "Synthesizing voiceover…");
    const { audio, contentType } = await generateTts({
      voiceId: req.voiceId,
      text: req.script,
      modelId: req.voiceModelId,
    });
    const audioUpload = await uploadBuffer(`audio/${jobId}.mp3`, audio, contentType);
    await updateJob(jobId, { audioUrl: audioUpload.url });

    // 2) Primary clip
    await setStatus(jobId, "video", 25, `Generating primary ${req.aspect} clip with ${videoModel.label}…`);
    const visualPrompt = buildVisualPrompt(req);
    const primary = await renderVideoAspect(jobId, req, req.aspect, visualPrompt, videoModel);
    const variants: Partial<Record<AspectRatio, string>> = { [req.aspect]: primary.url };
    await updateJob(jobId, { videoUrl: primary.url, variants });

    // 3) Remaining aspect ratios in parallel
    const others = ALL_ASPECTS.filter((a) => a !== req.aspect && videoModel.aspects.includes(a));
    if (others.length) {
      await setStatus(jobId, "video", 50, `Rendering ${others.length} additional aspect ratio(s)…`);
      const results = await Promise.allSettled(
        others.map((a) => renderVideoAspect(jobId, req, a, visualPrompt, videoModel)),
      );
      for (const r of results) {
        if (r.status === "fulfilled") variants[r.value.aspect] = r.value.url;
      }
      await updateJob(jobId, { variants });
    }

    // 4) Optional cover image
    if (req.generateImage) {
      await setStatus(jobId, "image", 75, "Generating cover image…");
      const url = await generateCoverImage(jobId, req);
      if (url) await updateJob(jobId, { thumbnailUrl: url });
    }

    // 5) Optional background music
    if (req.generateMusic) {
      await setStatus(jobId, "music", 90, "Generating background music…");
      const url = await generateMusic(jobId, req);
      if (url) await updateJob(jobId, { musicUrl: url });
    }

    await updateJob(jobId, { status: "done", progress: 100, message: "Ready" });
  } catch (err) {
    await failJob(jobId, err);
  }
}
