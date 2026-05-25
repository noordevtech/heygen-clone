import { getChannel, recordChannelRun, type Channel } from "./channels";
import { brainstormAndPickBest, writeFullScript, generateSeoMetadata } from "./agent";
import { planLongformScenes } from "./anthropic";
import { listVoices } from "./elevenlabs";
import { searchPexels } from "./stock";
import { createJob, getJob } from "./jobs";
import { enqueueVideoJob } from "./queue";
import { uploadVideo } from "./youtube";
import { getSetting } from "./settings";

export type ChannelRunResult = {
  jobId: string;
  title: string;
  sceneCount: number;
  voice: string;
  bestRationale: string;
};

/**
 * Brainstorm → pick best → write script → plan scenes → fetch Pexels →
 * enqueue a longform job with `autoPublish + channelId` so the worker
 * uploads to YouTube once compositing finishes.
 *
 * Synchronous Claude work (~30-90s) is done in-process; the actual video
 * compositing is handed off to the worker via BullMQ.
 *
 * The channel row is marked `lastStatus="running"` upfront — both so the UI
 * shows "in progress" and so the scheduler tick doesn't double-fire while
 * the run is in flight.
 */
export async function runChannelAgentAndQueue(channelId: string): Promise<ChannelRunResult> {
  const channel = await getChannel(channelId);
  if (!channel) throw new Error("Channel not found");

  // Claim the slot first — scheduler ticks happen every minute and the
  // brainstorm + script + scene-planning step alone can take 60s+.
  await recordChannelRun(channelId, {
    status: "running",
    touch: true,
    error: null,
    videoUrl: null,
    youtubeUrl: null,
  });

  try {
    return await runChannelPipeline(channel);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Channel run failed";
    await recordChannelRun(channelId, { status: "error", error: message });
    throw err;
  }
}

async function runChannelPipeline(channel: Channel): Promise<ChannelRunResult> {
  // 1. ElevenLabs voice (first available — channels don't have per-voice
  //    config yet, that's a documented follow-up).
  const voices = await listVoices();
  const voice = voices[0];
  if (!voice) {
    throw new Error(
      "No ElevenLabs voices available. Add an ElevenLabs API key in /settings.",
    );
  }

  // 2. Brainstorm 5 ideas + pick the strongest.
  const { ideas, bestIndex, bestRationale } = await brainstormAndPickBest({
    niche: channel.niche,
    count: 5,
  });
  const pick = ideas[bestIndex];

  // 3. Full script.
  const { title, script } = await writeFullScript({
    topic: pick.title,
    hook: pick.hook,
    angle: pick.angle,
    lengthMin: channel.targetLengthMin,
  });

  // 4. Scene plan (Pexels keywords per scene).
  const plan = await planLongformScenes(script);

  // 5. Pexels per scene — parallel, drop misses.
  const scenes = await Promise.all(
    plan.scenes.map(async (s) => {
      try {
        const photos = await searchPexels({
          query: s.keywords,
          orientation: "landscape",
          perPage: 1,
        });
        const photo = photos[0];
        if (!photo) return null;
        return {
          text: s.text,
          imageUrl: photo.url,
          imageAttribution: `Photo by ${photo.photographer} on Pexels`,
        };
      } catch {
        return null;
      }
    }),
  );
  const usable = scenes.filter((s): s is NonNullable<typeof s> => !!s);
  if (usable.length === 0) {
    throw new Error(
      `Pexels returned no images for any of the ${plan.scenes.length} scenes — try a more visual niche or check the Pexels API key.`,
    );
  }

  // 6. Queue the longform job. Title card is intentionally disabled per
  //    spec; the worker auto-publishes to YouTube on completion.
  const finalTitle = `${channel.name} · ${title || plan.title || channel.niche}`.slice(0, 200);
  const job = await createJob({
    kind: "longform",
    title: finalTitle,
    voiceId: voice.id,
    scenes: usable,
    width: 1920,
    height: 1080,
    transitions: "crossfade",
    colorGrade: "none",
    burnCaptions: false,
    generateMusic: false,
    titleCard: { enabled: false },
    scenePauseSec: 0.4,
    styleId: channel.style,
    channelId: channel.id,
    autoPublish: true,
    script,
  });
  await enqueueVideoJob(job.id);

  // Snapshot the latest title/job on the channel so the Tasks UI can show
  // "running · <title>" without polling the jobs table.
  await recordChannelRun(channel.id, {
    status: "running",
    jobId: job.id,
    title: finalTitle,
  });

  return {
    jobId: job.id,
    title: finalTitle,
    sceneCount: usable.length,
    voice: voice.name,
    bestRationale,
  };
}

/**
 * Run after the worker successfully finishes a longform job that was
 * triggered by a channel with `autoPublish: true`. Generates SEO metadata
 * from the script, uploads the video to YouTube, and writes the result
 * back to the channel row.
 *
 * Failures here mark the channel as `error` but don't re-throw — the
 * longform job itself is still "done" from BullMQ's perspective.
 */
export async function runChannelAutoPublish(jobId: string, channelId: string): Promise<void> {
  const job = await getJob(jobId);
  if (!job) return;
  if (job.status !== "done" || !job.videoUrl) {
    await recordChannelRun(channelId, {
      status: "error",
      error: `Longform job ended in status ${job?.status ?? "unknown"} — no video to publish.`,
    });
    return;
  }

  const channel = await getChannel(channelId);
  if (!channel) return;

  // The script + title we captured upstream. Fall back gracefully if either
  // is missing.
  const req = job.request;
  const script =
    (req.kind === "longform" && req.script) ||
    (req.kind === "longform" ? req.scenes.map((s) => s.text).join("\n\n") : "");
  const workingTitle = (req.kind === "longform" && req.title) || channel.name;

  try {
    // 1. SEO metadata via Claude (title, description, tags).
    const seo = await generateSeoMetadata({ title: workingTitle, script });

    // Require a connected YouTube account before attempting upload.
    const refresh = await getSetting("youtube_refresh_token");
    if (!refresh) {
      throw new Error(
        "YouTube account not connected — open /settings and click Connect YouTube.",
      );
    }

    // 2. Upload to YouTube.
    const description = [seo.description, "", seo.hashtags.join(" ")].join("\n").trim();
    const uploaded = await uploadVideo({
      videoUrl: job.videoUrl,
      title: seo.title.slice(0, 100),
      description: description.slice(0, 5000),
      tags: seo.tags.slice(0, 30),
      privacyStatus: "public",
    });

    await recordChannelRun(channelId, {
      status: "done",
      title: seo.title,
      videoUrl: job.videoUrl,
      youtubeUrl: uploaded.watchUrl,
      error: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordChannelRun(channelId, {
      status: "error",
      videoUrl: job.videoUrl,
      error: message,
    });
  }
}
