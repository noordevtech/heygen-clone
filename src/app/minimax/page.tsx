import { MinimaxStudio } from "@/components/MinimaxStudio";

export const metadata = {
  title: "MiniMax · Hailuo video",
};

export default function MinimaxPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">MiniMax · Hailuo video</h1>
        <p className="text-sm text-muted max-w-2xl">
          Direct text-to-video and image-to-video generation through the MiniMax Hailuo API.
          Pick a target platform and the request is rendered at the right aspect ratio with no
          extra editing.
        </p>
        <p className="text-xs text-muted">
          Set the MiniMax API key on{" "}
          <a href="/settings" className="underline hover:text-ink">
            /settings
          </a>{" "}
          first.
        </p>
      </header>
      <MinimaxStudio />
    </div>
  );
}
