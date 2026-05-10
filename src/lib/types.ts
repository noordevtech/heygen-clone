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
};

export type AnyJobRequest = GenerateRequest | LongformRequest | MinimaxRequest;

export type Platform = "youtube" | "instagram" | "tiktok" | "facebook";

/**
 * Direct-to-MiniMax single-clip generation. Backed by the platform.minimax.io
 * Hailuo video API — supports text-to-video and image-to-video.
 */
export type MinimaxRequest = {
  kind: "minimax";
  prompt: string;
  /** Optional starting frame; when set the request becomes image-to-video. */
  firstFrameImageUrl?: string;
  /** Model slug (e.g. "MiniMax-Hailuo-2.3", "I2V-01-Director"). */
  model: string;
  /** "768P" | "1080P". */
  resolution?: "768P" | "1080P";
  /** Clip duration in seconds (model-dependent — typically 6 or 10). */
  durationSec?: number;
  /** Target social platform; informs aspect ratio + optional ffmpeg post-crop. */
  platform?: Platform;
  /** Optional title for the job listing. */
  title?: string;
};

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
};
