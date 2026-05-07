import { generateTts } from "./elevenlabs";
import { generateClip } from "./openrouter";
import { uploadBuffer, uploadFromUrl } from "./r2";
import { failJob, setStatus, updateJob } from "./jobs";
import type { GenerateRequest, AspectRatio } from "./types";

/**
 * Build a visual prompt from the user's script. We strip stage directions and
 * focus on imagery that the video model can actually render.
 */
function buildVisualPrompt(req: GenerateRequest): string {
  if (req.visualPrompt && req.visualPrompt.trim().length > 0) return req.visualPrompt.trim();
  const base = req.script.replace(/\s+/g, " ").trim().slice(0, 500);
  if (req.avatar) {
    return `Photorealistic talking-head of a charismatic presenter speaking directly to camera, soft studio lighting, shallow depth of field. The presenter says: "${base}".`;
  }
  return `Cinematic b-roll illustrating: ${base}. Vibrant, social-media friendly, 24fps, high contrast.`;
}

const ALL_ASPECTS: AspectRatio[] = ["9:16", "1:1", "16:9"];

export async function runPipeline(jobId: string, req: GenerateRequest): Promise<void> {
  try {
    // 1) Text-to-speech
    setStatus(jobId, "tts", 10, "Synthesizing voiceover…");
    const { audio, contentType: audioCt } = await generateTts({
      voiceId: req.voiceId,
      text: req.script,
      modelId: req.voiceModelId,
    });
    const audioKey = `audio/${jobId}.mp3`;
    const audioUpload = await uploadBuffer(audioKey, audio, audioCt);
    updateJob(jobId, { audioUrl: audioUpload.url });

    // 2) Video generation for the primary aspect ratio.
    setStatus(jobId, "video", 35, "Generating primary clip…");
    const visualPrompt = buildVisualPrompt(req);
    const primary = await generateClip({
      model: req.videoModel,
      prompt: visualPrompt,
      aspect: req.aspect,
      durationSec: req.durationSec ?? 6,
      audioUrl: req.avatar ? audioUpload.url : undefined,
    });

    setStatus(jobId, "uploading", 60, "Uploading primary clip to R2…");
    const primaryKey = `video/${jobId}/${req.aspect.replace(":", "x")}.mp4`;
    const primaryUpload = await uploadFromUrl(primaryKey, primary.videoUrl, "video/mp4");

    const variants: Partial<Record<AspectRatio, string>> = {
      [req.aspect]: primaryUpload.url,
    };

    // 3) Generate the remaining aspect ratios in parallel.
    const others = ALL_ASPECTS.filter((a) => a !== req.aspect);
    setStatus(jobId, "video", 70, `Generating ${others.length} additional aspect ratio(s)…`);
    const results = await Promise.allSettled(
      others.map(async (aspect) => {
        const clip = await generateClip({
          model: req.videoModel,
          prompt: visualPrompt,
          aspect,
          durationSec: req.durationSec ?? 6,
          audioUrl: req.avatar ? audioUpload.url : undefined,
        });
        const key = `video/${jobId}/${aspect.replace(":", "x")}.mp4`;
        const up = await uploadFromUrl(key, clip.videoUrl, "video/mp4");
        return { aspect, url: up.url };
      }),
    );
    for (const r of results) {
      if (r.status === "fulfilled") variants[r.value.aspect] = r.value.url;
    }

    updateJob(jobId, {
      status: "done",
      progress: 100,
      videoUrl: primaryUpload.url,
      variants,
      message: "Ready",
    });
  } catch (err) {
    failJob(jobId, err);
  }
}
