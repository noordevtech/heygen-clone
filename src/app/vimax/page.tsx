import { ViMaxStudio } from "@/components/ViMaxStudio";

export const metadata = {
  title: "ViMax · Idea to video",
};

export default function ViMaxPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">ViMax · Idea → Video</h1>
        <p className="text-sm text-muted max-w-2xl">
          Type a single idea. Claude writes a multi-scene narration, your chosen Kie.ai image
          model renders a frame for each scene in your selected art style, ElevenLabs voices it,
          and the long-form pipeline composites the final video with crossfades, captions, color
          grading, and optional Suno music.
        </p>
        <p className="text-xs text-muted max-w-2xl">
          Inspired by{" "}
          <a
            className="underline hover:text-ink"
            href="https://github.com/HKUDS/ViMax"
            target="_blank"
            rel="noreferrer"
          >
            HKUDS/ViMax
          </a>
          . Per-scene Veo video clips (the full ViMax flow) need worker-side support — coming
          next; v1 ships AI image scenes composited with Ken Burns.
        </p>
      </header>
      <ViMaxStudio />
    </div>
  );
}
