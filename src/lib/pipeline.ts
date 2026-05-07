import { generateTts } from "./elevenlabs";
import { createVideo, waitForVideo } from "./openrouter";
import { uploadBuffer, uploadFromUrl } from "./r2";
import { failJob, setStatus, updateJob } from "./jobs";
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

async function renderAspect(
  jobId: string,
  req: GenerateRequest,
  aspect: AspectRatio,
  prompt: string,
): Promise<{ aspect: AspectRatio; url: string }> {
  const created = await createVideo({
    model: req.videoModel,
    prompt,
    aspect,
    durationSec: req.durationSec,
    generateAudio: req.avatar, // Veo / Seedance 1.5 generate native audio
  });
  const { videoUrl } = await waitForVideo(created);
  const key = `video/${jobId}/${aspect.replace(":", "x")}.mp4`;
  const up = await uploadFromUrl(key, videoUrl, "video/mp4");
  return { aspect, url: up.url };
}

export async function runPipeline(jobId: string, req: GenerateRequest): Promise<void> {
  try {
    // 1) Voiceover
    await setStatus(jobId, "tts", 10, "Synthesizing voiceover…");
    const { audio, contentType } = await generateTts({
      voiceId: req.voiceId,
      text: req.script,
      modelId: req.voiceModelId,
    });
    const audioUpload = await uploadBuffer(`audio/${jobId}.mp3`, audio, contentType);
    await updateJob(jobId, { audioUrl: audioUpload.url });

    // 2) Primary clip
    await setStatus(jobId, "video", 35, `Generating primary ${req.aspect} clip…`);
    const visualPrompt = buildVisualPrompt(req);
    const primary = await renderAspect(jobId, req, req.aspect, visualPrompt);

    await setStatus(jobId, "uploading", 60, `Primary ${req.aspect} ready. Rendering remaining aspects…`);
    const variants: Partial<Record<AspectRatio, string>> = { [req.aspect]: primary.url };

    // 3) Remaining aspect ratios in parallel
    const others = ALL_ASPECTS.filter((a) => a !== req.aspect);
    const results = await Promise.allSettled(
      others.map((a) => renderAspect(jobId, req, a, visualPrompt)),
    );
    for (const r of results) {
      if (r.status === "fulfilled") variants[r.value.aspect] = r.value.url;
    }

    await updateJob(jobId, {
      status: "done",
      progress: 100,
      videoUrl: primary.url,
      variants,
      message: "Ready",
    });
  } catch (err) {
    await failJob(jobId, err);
  }
}
