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

  // Optional background music
  generateMusic?: boolean;
  musicModelId?: string;
  musicPrompt?: string;
  musicInstrumental?: boolean;
};

export type LongformScene = {
  text: string;
  imageUrl: string;
  imageAttribution?: string;
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
};

export type AnyJobRequest = GenerateRequest | LongformRequest;

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
