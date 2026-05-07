import { StudioForm } from "@/components/StudioForm";

export default function HomePage() {
  return (
    <main className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
          Generate AI reels for{" "}
          <span className="bg-gradient-to-r from-accent to-accent2 bg-clip-text text-transparent">
            TikTok, Reels & Feed
          </span>
        </h1>
        <p className="text-[#9aa0b4] max-w-2xl">
          Type a script, pick a voice, choose Seedance 2 or Veo 3, and we render a vertical, square and
          landscape master in one shot — voiced with ElevenLabs and stored on Cloudflare R2.
        </p>
      </div>
      <StudioForm />
    </main>
  );
}
