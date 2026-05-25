import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "@/lib/channels";
import { writeFullScript } from "@/lib/agent";
import { planLongformScenes } from "@/lib/anthropic";
import { listVoices } from "@/lib/elevenlabs";
import { searchPexels } from "@/lib/stock";
import { createJob } from "@/lib/jobs";
import { enqueueVideoJob } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/channels/:id/fire
 *
 * "Fire the cron now" — synchronously runs the agent pipeline for one
 * channel and queues a longform video job. Equivalent to a scheduled run
 * but on-demand, ignoring the channel's schedule + runTime.
 *
 * Pipeline (~30-60s end-to-end before job queues):
 *   1. Resolve channel + pick the first available ElevenLabs voice
 *   2. Claude writes a ~5-min script grounded in the channel niche
 *   3. Claude splits the script into scenes with Pexels-friendly keywords
 *   4. Pexels search per scene in parallel — top result attached
 *   5. Submit a longform job with sensible defaults (16:9, crossfade,
 *      no music, no captions). The worker then handles TTS + ffmpeg.
 *
 * Returns { jobId } so the UI can deep-link to /jobs.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const channel = await getChannel(id);
  if (!channel) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  try {
    // 1. Voice — first one ElevenLabs returns. The user can edit per-channel
    //    voice later if needed; for "fire now" we keep it dead-simple.
    const voices = await listVoices();
    const voice = voices[0];
    if (!voice) {
      return NextResponse.json(
        { error: "No ElevenLabs voices available. Add an ElevenLabs API key in /settings." },
        { status: 400 },
      );
    }

    // 2. Script — Claude writes a video about the channel niche at the
    //    channel's configured target length.
    const topic = `Most compelling story or insight about ${channel.niche}`;
    const { title, script } = await writeFullScript({
      topic,
      lengthMin: channel.targetLengthMin,
    });

    // 3. Scene plan — Claude splits the script into ~10-15 scenes.
    const plan = await planLongformScenes(script);

    // 4. Per-scene Pexels (parallel, fast).
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
      return NextResponse.json(
        {
          error: `Pexels returned no images for any of the ${plan.scenes.length} scenes — try a more visual niche or check your Pexels API key.`,
        },
        { status: 502 },
      );
    }

    // 5. Queue the longform job.
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
      titleCard: { enabled: true, text: finalTitle },
      scenePauseSec: 0.4,
      styleId: channel.style,
    });
    await enqueueVideoJob(job.id);

    return NextResponse.json({
      jobId: job.id,
      title: finalTitle,
      sceneCount: usable.length,
      voice: voice.name,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fire failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
