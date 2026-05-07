import { YouTubeStudio } from "@/components/YouTubeStudio";

export const dynamic = "force-dynamic";

export default function YouTubePage() {
  return (
    <main className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Long-form videos for{" "}
          <span className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-transparent">
            YouTube
          </span>
        </h1>
        <p className="text-muted max-w-2xl">
          Paste a script. We split it into scenes, fetch matching B-roll from Pexels, narrate each
          scene with your chosen voice, optionally add a Suno-generated soundtrack, and stitch the
          whole thing into a 1080p MP4 with ffmpeg.
        </p>
      </div>
      <YouTubeStudio />
    </main>
  );
}
