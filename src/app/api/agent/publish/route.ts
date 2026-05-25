import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getJob } from "@/lib/jobs";
import {
  addToPlaylist,
  createPlaylist,
  optimalPublishTime,
  setThumbnail,
  uploadVideo,
} from "@/lib/youtube";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Uploads can take 30-90s depending on the source-video size. Bump the
// route-level limit so Next/Vercel doesn't kill the function mid-upload.
export const maxDuration = 300;

const Body = z.object({
  /** Either jobId (source URLs from a completed longform job) or videoUrl. */
  jobId: z.string().uuid().optional(),
  videoUrl: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
  title: z.string().min(1).max(100),
  description: z.string().max(5000).default(""),
  tags: z.array(z.string().min(1).max(40)).max(30).optional(),
  privacyStatus: z.enum(["public", "unlisted", "private"]).default("public"),
  /** Either an explicit ISO timestamp, or `optimal: true` to pick one. Both
   *  are optional — leave them off to publish immediately at privacyStatus. */
  publishAt: z.string().datetime().optional(),
  optimal: z.boolean().optional(),
  madeForKids: z.boolean().optional(),
  /** Add to an existing playlist… */
  playlistId: z.string().min(1).optional(),
  /** …or create a new one with this title. Ignored if playlistId is set. */
  newPlaylistTitle: z.string().min(1).max(150).optional(),
});

/**
 * POST /api/agent/publish
 *
 * Publishing Agent — uploads a finished video to the connected YouTube
 * channel, optionally schedules it for a future timestamp, and optionally
 * adds it to a playlist (existing or freshly created).
 *
 * End-screens are NOT supported by YouTube Data API v3. We return a
 * `note` field reminding the caller to configure them in YouTube Studio.
 */
export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const detail = first
      ? `${first.path.join(".") || "body"}: ${first.message}`
      : "validation failed";
    return NextResponse.json(
      { error: `Invalid request (${detail})`, issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Resolve videoUrl + (optional) thumbnailUrl. Either source them straight
  // from a completed job or trust what the caller passed in.
  let videoUrl = input.videoUrl;
  let thumbnailUrl = input.thumbnailUrl;
  if (input.jobId) {
    const job = await getJob(input.jobId);
    if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    if (job.status !== "done") {
      return NextResponse.json(
        { error: `Job is ${job.status}, not done yet — cannot publish.` },
        { status: 400 },
      );
    }
    if (!job.videoUrl) {
      return NextResponse.json({ error: "Job has no videoUrl" }, { status: 400 });
    }
    videoUrl = videoUrl ?? job.videoUrl;
    thumbnailUrl = thumbnailUrl ?? job.thumbnailUrl;
  }
  if (!videoUrl) {
    return NextResponse.json(
      { error: "Either jobId (of a completed job) or videoUrl is required" },
      { status: 400 },
    );
  }

  // Resolve schedule.
  let publishAt: string | undefined = input.publishAt;
  if (!publishAt && input.optimal) publishAt = optimalPublishTime();

  try {
    // 1. Upload the video.
    const uploaded = await uploadVideo({
      videoUrl,
      title: input.title,
      description: input.description,
      tags: input.tags,
      privacyStatus: input.privacyStatus,
      publishAt,
      madeForKids: input.madeForKids,
    });

    // 2. Thumbnail (best-effort).
    let thumbnailWarning: string | undefined;
    if (thumbnailUrl) {
      try {
        await setThumbnail({ videoId: uploaded.videoId, thumbnailUrl });
      } catch (err) {
        thumbnailWarning = err instanceof Error ? err.message : String(err);
      }
    }

    // 3. Playlist (best-effort).
    let playlistId = input.playlistId;
    let playlistTitle: string | undefined;
    let playlistWarning: string | undefined;
    if (!playlistId && input.newPlaylistTitle) {
      try {
        const pl = await createPlaylist({
          title: input.newPlaylistTitle,
          privacyStatus: "public",
        });
        playlistId = pl.id;
        playlistTitle = pl.title;
      } catch (err) {
        playlistWarning = err instanceof Error ? err.message : String(err);
      }
    }
    if (playlistId) {
      try {
        await addToPlaylist({ videoId: uploaded.videoId, playlistId });
      } catch (err) {
        playlistWarning = err instanceof Error ? err.message : String(err);
      }
    }

    return NextResponse.json({
      videoId: uploaded.videoId,
      watchUrl: uploaded.watchUrl,
      studioUrl: uploaded.studioUrl,
      scheduledFor: publishAt ?? null,
      privacyStatus: publishAt ? "private (scheduled)" : input.privacyStatus,
      playlistId: playlistId ?? null,
      playlistTitle: playlistTitle ?? null,
      thumbnailWarning,
      playlistWarning,
      note: "End-screens are NOT exposed by YouTube Data API v3 — configure them in YouTube Studio.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
