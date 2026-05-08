import { createVideoTask, waitForVideo } from "./minimax";
import { uploadFromUrl } from "./r2";
import { failJob, setStatus, updateJob } from "./jobs";
import type { MinimaxRequest, Platform } from "./types";

/**
 * Map a target platform to a MiniMax-friendly aspect-ratio string. MiniMax's
 * accepted values vary by model — these are the safest defaults.
 */
function aspectFor(platform?: Platform): string {
  switch (platform) {
    case "tiktok":
    case "instagram":
      return "9:16";
    case "facebook":
    case "youtube":
    default:
      return "16:9";
  }
}

export async function runMinimaxPipeline(
  jobId: string,
  req: MinimaxRequest,
): Promise<void> {
  try {
    await setStatus(jobId, "video", 5, "Submitting MiniMax video task…");
    const taskId = await createVideoTask({
      model: req.model,
      prompt: req.prompt,
      resolution: req.resolution ?? "1080P",
      duration: req.durationSec ?? 6,
      firstFrameImage: req.firstFrameImageUrl,
      aspectRatio: aspectFor(req.platform),
    });
    await updateJob(jobId, { message: `MiniMax task ${taskId} queued` });

    await setStatus(jobId, "video", 25, "MiniMax rendering — typically 1–3 minutes…");
    const downloadUrl = await waitForVideo(taskId);

    await setStatus(jobId, "uploading", 90, "Uploading final clip to storage…");
    const upload = await uploadFromUrl(`minimax/${jobId}/clip.mp4`, downloadUrl, "video/mp4");

    await updateJob(jobId, {
      status: "done",
      progress: 100,
      message: `Ready · ${req.platform ?? "16:9"} · ${req.resolution ?? "1080P"}`,
      videoUrl: upload.url,
    });
  } catch (err) {
    await failJob(jobId, err);
  }
}
