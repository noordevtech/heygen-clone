import { getChannel, recordChannelRun, type Channel } from "./channels";
import {
  attachTaskJob,
  claimNextChannelTask,
  completeChannelTask,
  failChannelTask,
  getChannelTaskByJobId,
  type ChannelTask,
} from "./channel-tasks";
import { brainstormAndPickBest, writeFullScript, generateSeoMetadata } from "./agent";
import { planLongformScenes } from "./anthropic";
import { listVoices } from "./elevenlabs";
import { searchPexels } from "./stock";
import { createJob, getJob, listJobsForChannel, updateJob } from "./jobs";
import { enqueueVideoJob } from "./queue";
import { setThumbnail, uploadCaption, uploadVideo } from "./youtube";
import { getConnectionWithTokenById } from "./youtube-connections";
import { generateAgentThumbnail } from "./agent-thumbnail";
import { buildSceneSrt } from "./srt";

/** YouTube category id for "Education". Hardcoded per channel spec; if we
 *  add per-channel categories later, swap this for a column on `channels`. */
const YT_CATEGORY_EDUCATION = "27";
/** BCP-47 code for English. Applied to snippet.defaultLanguage,
 *  snippet.defaultAudioLanguage, and the uploaded caption track. */
const YT_LANG_ENGLISH = "en";

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
  // 1. ElevenLabs voice. Prefer the per-channel `voiceId` if set; otherwise
  //    fall back to the first voice the user's key returns.
  const voices = await listVoices();
  if (voices.length === 0) {
    throw new Error(
      "No ElevenLabs voices available. Add an ElevenLabs API key in /settings.",
    );
  }
  let voice = voices[0];
  if (channel.voiceId) {
    const match = voices.find((v) => v.id === channel.voiceId);
    if (match) {
      voice = match;
    } else {
      console.warn(
        `[channel-runner] channel=${channel.name} saved voiceId=${channel.voiceId} not found in ElevenLabs — falling back to "${voice.name}".`,
      );
    }
  }
  console.log(
    `[channel-runner] channel=${channel.name} voice="${voice.name}" id=${voice.id}${channel.voiceId === voice.id ? " (channel-picked)" : " (default — channel has no voiceId set)"}`,
  );

  // 2. Pick the topic. If the user has queued manual tasks for this channel,
  //    pop the oldest one — it skips the brainstorm step entirely and uses
  //    the user-supplied title + description as the brief. Otherwise fall
  //    back to brainstorm-and-pick with past-title dedup.
  const claimedTask = await claimNextChannelTask(channel.id);
  // Wrap the rest in try/catch so a downstream failure flips the task back
  // to "error" instead of leaving it stuck in "running".
  try {
    return await runWithPick(channel, voice, claimedTask);
  } catch (err) {
    if (claimedTask) {
      const msg = err instanceof Error ? err.message : String(err);
      await failChannelTask(claimedTask.id, msg);
    }
    throw err;
  }
}

async function runWithPick(
  channel: Channel,
  voice: { id: string; name: string },
  claimedTask: ChannelTask | null,
): Promise<ChannelRunResult> {
  let pick: { title: string; hook?: string; angle?: string };
  let bestRationale: string;
  if (claimedTask) {
    pick = {
      title: claimedTask.title,
      angle: claimedTask.description || undefined,
    };
    bestRationale = `Manual task ${claimedTask.id} — skipped brainstorm.`;
    console.log(
      `[channel-runner] channel=${channel.name} claimed manual task "${claimedTask.title}" (id=${claimedTask.id}).`,
    );
  } else {
    const past = await pastChannelTitles(channel);
    const { ideas, bestIndex } = await brainstormAndPickBest({
      niche: channel.niche,
      count: 5,
      avoidTitles: past,
      channelBrief: channel.brief ?? undefined,
    });
    // Defensive: even with the avoid list, Claude can paraphrase a past title.
    // Walk the returned ideas in (best-first, then in order) and take the first
    // one that doesn't collide with anything we've already produced. Fall back
    // to Claude's pick if every idea is a near-duplicate.
    const pickIdx = pickFreshIdea(ideas, bestIndex, past);
    pick = ideas[pickIdx];
    bestRationale = pickIdx === bestIndex ? "Claude's top pick." : "Overrode bestIndex (duplicate).";
    if (pickIdx !== bestIndex) {
      console.log(
        `[channel-runner] channel=${channel.name} overrode Claude's bestIndex=${bestIndex} ("${ideas[bestIndex].title}") — too close to a past title. Picked ${pickIdx} ("${pick.title}") instead.`,
      );
    }
  }

  // 3. Full script.
  const { title, script } = await writeFullScript({
    topic: pick.title,
    hook: pick.hook,
    angle: pick.angle,
    lengthMin: channel.targetLengthMin,
    channelBrief: channel.brief ?? undefined,
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
  //    spec; the worker auto-publishes to YouTube on completion. The job
  //    inherits the channel's owner — the worker reads job.userId to set
  //    the right ALS context (so the channel owner's API keys + YT token
  //    are used).
  const finalTitle = `${channel.name} · ${title || plan.title || channel.niche}`.slice(0, 200);
  const job = await createJob(
    {
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
    },
    channel.userId ?? undefined,
  );
  await enqueueVideoJob(job.id);

  // If this run claimed a manual task, link the resulting job back so the
  // task's audit row points at the produced video. Completion (or error) is
  // marked once the worker's auto-publish hook finishes.
  if (claimedTask) {
    await attachTaskJob(claimedTask.id, job.id);
  }

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
    // 1. SEO metadata via Claude (title, description, tags, thumbnailPrompt).
    const seo = await generateSeoMetadata({ title: workingTitle, script });

    // Resolve which YouTube channel to publish to. Each channel row picks
    // one connection; without it, publishing is disabled (the render
    // pipeline still finished successfully, so we mark `done`).
    if (!channel.youtubeConnectionId) {
      throw new Error(
        "No YouTube channel selected for this Task — open the Task and pick a connected YouTube channel under Settings.",
      );
    }
    const conn = await getConnectionWithTokenById(channel.youtubeConnectionId);
    if (!conn) {
      throw new Error(
        "Selected YouTube connection was deleted — reconnect on /settings and update this Task.",
      );
    }

    // 2. Thumbnail via OpenRouter. Best-effort — a failure here doesn't
    //    block publishing (the user can upload one in YT Studio later).
    let thumbnailUrl: string | undefined;
    let thumbnailWarning: string | undefined;
    try {
      const thumb = await generateAgentThumbnail({
        prompt: seo.thumbnailPrompt,
        aspect: "16:9",
      });
      thumbnailUrl = thumb.url;
    } catch (err) {
      thumbnailWarning = err instanceof Error ? err.message : String(err);
      console.warn(`[autoPublish] thumbnail generation failed: ${thumbnailWarning}`);
    }

    // 3. Upload video — Education category, English language + audio.
    //    The whole pipeline is AI-generated (TTS narration + thumbnail),
    //    so we always declare synthetic media to stay on the right side
    //    of YouTube's altered-content disclosure policy.
    const description = [seo.description, "", seo.hashtags.join(" ")].join("\n").trim();
    const uploaded = await uploadVideo(conn.refreshToken, {
      videoUrl: job.videoUrl,
      title: seo.title.slice(0, 100),
      description: description.slice(0, 5000),
      tags: seo.tags.slice(0, 30),
      privacyStatus: "public",
      categoryId: YT_CATEGORY_EDUCATION,
      defaultLanguage: YT_LANG_ENGLISH,
      defaultAudioLanguage: YT_LANG_ENGLISH,
      containsSyntheticMedia: true,
    });

    // 4. Apply thumbnail (best-effort).
    if (thumbnailUrl) {
      try {
        await setThumbnail(conn.refreshToken, {
          videoId: uploaded.videoId,
          thumbnailUrl,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[autoPublish] setThumbnail failed: ${message}`);
        thumbnailWarning = thumbnailWarning ?? message;
      }
    }

    // 5. Upload captions (best-effort).
    let captionsWarning: string | undefined;
    if (req.kind === "longform") {
      try {
        const srt = buildSceneSrt({
          scenes: req.scenes,
          durationsSec: req.sceneAudioDurationsSec,
          scenePauseSec: req.scenePauseSec ?? 0.4,
        });
        await uploadCaption(conn.refreshToken, {
          videoId: uploaded.videoId,
          language: YT_LANG_ENGLISH,
          name: "English",
          body: srt,
        });
      } catch (err) {
        captionsWarning = err instanceof Error ? err.message : String(err);
        console.warn(`[autoPublish] caption upload failed: ${captionsWarning}`);
      }
    }

    // Warnings (thumbnail / captions) are logged server-side but don't
    //   flag the row as errored — the video itself is live on YouTube.
    if (thumbnailWarning || captionsWarning) {
      console.warn(
        `[autoPublish] ${seo.title}: published with warnings — thumbnail=${thumbnailWarning ?? "ok"} · captions=${captionsWarning ?? "ok"}`,
      );
    }

    // Stamp the YouTube URL + thumbnail on the job row so the channel
    // history page (/tasks/:id) can list every published run.
    await updateJob(jobId, {
      youtubeUrl: uploaded.watchUrl,
      thumbnailUrl: thumbnailUrl ?? null,
      message: `Published · ${uploaded.watchUrl}`,
    });

    await recordChannelRun(channelId, {
      status: "done",
      title: seo.title,
      videoUrl: job.videoUrl,
      youtubeUrl: uploaded.watchUrl,
      error: null,
    });
    // If this run consumed a manual task, mark it done too.
    const linkedTask = await getChannelTaskByJobId(jobId);
    if (linkedTask) await completeChannelTask(linkedTask.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await recordChannelRun(channelId, {
      status: "error",
      videoUrl: job.videoUrl,
      error: message,
    });
    const linkedTask = await getChannelTaskByJobId(jobId);
    if (linkedTask) await failChannelTask(linkedTask.id, message);
  }
}

// ===========================================================================
// Topic dedup helpers
// ===========================================================================

/** Pull the last ~30 job titles produced for this channel, strip the
 *  `<channelName> · ` prefix that runChannelPipeline prepends, and return them
 *  newest-first. Used to tell Claude what to avoid on the next run. */
async function pastChannelTitles(channel: Channel): Promise<string[]> {
  const jobs = await listJobsForChannel(channel.id, 30);
  const prefix = `${channel.name} · `;
  const titles: string[] = [];
  for (const j of jobs) {
    const raw =
      j.request.kind === "longform" && j.request.title ? j.request.title : null;
    if (!raw) continue;
    const stripped = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
    titles.push(stripped.trim());
  }
  // De-dup just in case the channel re-ran with the same exact title.
  return Array.from(new Set(titles));
}

/** Lowercase + drop punctuation + tokenize. */
function normTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3),
  );
}

/** Jaccard overlap on normalized tokens. ≥ 0.5 means same topic for our
 *  purposes (catches "Rome Didn't Fall to Barbarians. It Fell to Inflation"
 *  vs "Rome Didn't Fall to Barbarians — It Fell to Inflation"). */
function tooSimilar(a: string, b: string): boolean {
  const ta = normTokens(a);
  const tb = normTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return inter / union >= 0.5;
}

/** From the brainstormed ideas, pick the first that doesn't collide with any
 *  past title. Tries Claude's preferred index first, then walks 0..N. */
function pickFreshIdea(
  ideas: { title: string }[],
  preferred: number,
  past: string[],
): number {
  const order = [preferred, ...ideas.map((_, i) => i).filter((i) => i !== preferred)];
  for (const i of order) {
    const t = ideas[i]?.title;
    if (!t) continue;
    if (!past.some((p) => tooSimilar(t, p))) return i;
  }
  return preferred;
}
