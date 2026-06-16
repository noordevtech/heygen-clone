import { generateAvatarVideo, waitForVideo } from "./heygen";
import { uploadFromUrl } from "./r2";
import { failJob, setStatus, updateJob } from "./jobs";
import type { HeygenRequest } from "./types";

/**
 * HeyGen avatar pipeline: submit the render, poll HeyGen until it's done,
 * then mirror the finished MP4 (and poster) onto R2 so we serve assets from
 * our own bucket like every other job kind.
 */
export async function runHeygenPipeline(jobId: string, req: HeygenRequest): Promise<void> {
  try {
    await setStatus(jobId, "video", 12, "Submitting render to HeyGen…");
    const videoId = await generateAvatarVideo({
      avatarId: req.avatarId,
      avatarStyle: req.avatarStyle,
      voiceId: req.voiceId,
      inputText: req.script,
      speed: req.speed,
      aspect: req.aspect,
      background: req.background,
      title: req.title,
    });

    await setStatus(jobId, "video", 30, "HeyGen is rendering your avatar…");
    const result = await waitForVideo(videoId, (s) => {
      // HeyGen doesn't expose a percentage; nudge the bar while processing.
      if (s.status === "processing") {
        void setStatus(jobId, "video", 55, "HeyGen is rendering your avatar…");
      }
    });

    await setStatus(jobId, "uploading", 85, "Saving video to storage…");
    const video = await uploadFromUrl(`heygen/${jobId}/final.mp4`, result.videoUrl, "video/mp4");

    let thumbnailUrl: string | undefined;
    if (result.thumbnailUrl) {
      try {
        const thumb = await uploadFromUrl(
          `heygen/${jobId}/thumb.jpg`,
          result.thumbnailUrl,
          "image/jpeg",
        );
        thumbnailUrl = thumb.url;
      } catch {
        // Poster is best-effort — never fail the job over a missing thumbnail.
      }
    }

    await updateJob(jobId, {
      videoUrl: video.url,
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      status: "done",
      progress: 100,
      message: "Ready",
    });
  } catch (err) {
    await failJob(jobId, err);
  }
}
