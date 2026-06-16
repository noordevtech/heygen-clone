import { HeygenStudio } from "@/components/HeygenStudio";

export default function HeygenPage() {
  return (
    <main className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Render a{" "}
          <span className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-transparent">
            HeyGen avatar
          </span>{" "}
          video
        </h1>
        <p className="text-muted max-w-2xl">
          Pick one of your created HeyGen avatars and a voice, type a script, and HeyGen renders a
          lip-synced talking-head video. The finished MP4 is mirrored to your Cloudflare R2 bucket.
        </p>
      </div>
      <HeygenStudio />
    </main>
  );
}
