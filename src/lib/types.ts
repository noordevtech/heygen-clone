export type AspectRatio = "9:16" | "1:1" | "16:9";
export type JobStatus =
  | "queued"
  | "tts"
  | "video"
  | "image"
  | "music"
  | "compositing"
  | "uploading"
  | "done"
  | "error";

export type Voice = {
  id: string;
  name: string;
  category?: string;
  preview_url?: string;
  labels?: Record<string, string>;
};

export type GenerateRequest = {
  /** Discriminator. Default 'reel' for legacy rows. */
  kind?: "reel";
  script: string;
  voiceId: string;
  voiceModelId?: string;

  // Video (required)
  videoModelId: string;
  aspect: AspectRatio;
  visualPrompt?: string;
  durationSec?: number;
  avatar?: boolean;

  // Optional cover/thumbnail image
  generateImage?: boolean;
  imageModelId?: string;
  imagePrompt?: string;

  /** Optional style preset id from STYLE_PRESETS. Appended to both the
   *  visualPrompt (video) and imagePrompt (cover image). */
  styleId?: string;

  // Optional background music
  generateMusic?: boolean;
  musicModelId?: string;
  musicPrompt?: string;
  musicInstrumental?: boolean;
};

export type LongformScene = {
  text: string;
  /** Image B-roll URL. Required when `mediaType` is "image" (or omitted). */
  imageUrl: string;
  /** Optional video B-roll URL. When set, the pipeline composites it instead
   *  of treating `imageUrl` as a still — `imageUrl` is then used only as a
   *  poster fallback if the video download fails. */
  videoUrl?: string;
  mediaType?: "image" | "video";
  imageAttribution?: string;
};

export type ColorGrade = "none" | "cinematic" | "warm" | "cool" | "bw";

export type TitleCard = {
  enabled: boolean;
  text?: string;
  durationSec?: number;
};

export type LongformRequest = {
  kind: "longform";
  title?: string;
  voiceId: string;
  voiceModelId?: string;
  scenes: LongformScene[];

  generateMusic?: boolean;
  musicModelId?: string;
  musicPrompt?: string;
  musicInstrumental?: boolean;

  /** Output resolution. Default 1920x1080. */
  width?: number;
  height?: number;

  /** Transition between scene clips. Default "crossfade". */
  transitions?: "none" | "crossfade";
  /** Burn the per-scene narration text as a caption track. */
  burnCaptions?: boolean;
  /** Color grade preset applied to every scene clip. Default "none". */
  colorGrade?: ColorGrade;
  /** Sidechain-duck the background music under speech. Default true. */
  duckMusic?: boolean;
  /** Seconds of silence padded after each scene's narration (except the
   *  last) so cuts don't run back-to-back. Default 0.4. */
  scenePauseSec?: number;
  titleCard?: TitleCard;
  outroCard?: TitleCard;

  /** Optional style preset id, appended to per-scene image/video prompts when
   *  scenes are AI-generated. Surfaced even when scenes use stock B-roll so
   *  the user's choice is captured for downstream use. */
  styleId?: string;

  /** When set, the job was triggered by a channel (Tasks page or the
   *  channel scheduler). The worker keys the post-publish hook off this. */
  channelId?: string;
  /** If true, the worker uploads the finished video to the connected YouTube
   *  account once the longform pipeline succeeds. Requires `channelId` to
   *  know which row to write the result back to. */
  autoPublish?: boolean;
  /** Full script — preserved on the request so the post-publish hook can
   *  feed it to the SEO generator without re-deriving from per-scene text. */
  script?: string;
  /** Filled in by the longform pipeline after TTS: actual narration
   *  duration per scene in seconds (parallel to `scenes`). Used by the
   *  post-publish hook to build accurate SRT caption timing. */
  sceneAudioDurationsSec?: number[];
};

export type AnyJobRequest = GenerateRequest | LongformRequest;

export type Platform = "youtube" | "instagram" | "tiktok" | "facebook";

export type Job = {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: JobStatus;
  request: AnyJobRequest;
  progress: number;
  message?: string;
  audioUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  musicUrl?: string;
  variants?: Partial<Record<AspectRatio, string>>;
  error?: string;
  /** YouTube watch URL, stamped by the channel auto-publish hook. */
  youtubeUrl?: string;
  /** Set when the job was triggered by a channel (Tasks page / scheduler). */
  channelId?: string;
};
