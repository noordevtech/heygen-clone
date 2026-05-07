export type AspectRatio = "9:16" | "1:1" | "16:9";
export type VideoModel = "seedance" | "veo";
export type JobStatus = "queued" | "tts" | "video" | "compositing" | "uploading" | "done" | "error";

export type Voice = {
  id: string;
  name: string;
  category?: string;
  preview_url?: string;
  labels?: Record<string, string>;
};

export type GenerateRequest = {
  script: string;
  voiceId: string;
  voiceModelId?: string;
  videoModel: VideoModel;
  aspect: AspectRatio;
  /** Optional visual prompt; defaults to using the script. */
  visualPrompt?: string;
  /** Seconds of clip to generate per scene. */
  durationSec?: number;
  /** Generate avatar/talking-head style (lip-synced narration). */
  avatar?: boolean;
};

export type Job = {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: JobStatus;
  request: GenerateRequest;
  progress: number; // 0..100
  message?: string;
  audioUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  variants?: Partial<Record<AspectRatio, string>>;
  error?: string;
};
