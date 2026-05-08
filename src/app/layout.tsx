import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Reels Studio",
  description: "Generate AI reels & feed videos for TikTok, Instagram and Facebook.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <header className="flex items-center justify-between mb-10">
            <a href="/" className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-accent2" />
              <div className="font-semibold text-lg text-ink">AI Reels Studio</div>
            </a>
            <nav className="flex items-center gap-6 text-sm text-muted">
              <a href="/" className="hover:text-ink transition-colors">Studio</a>
              <a href="/youtube" className="hover:text-ink transition-colors">YouTube</a>
              <a href="/jobs" className="hover:text-ink transition-colors">Jobs</a>
              <a href="/settings" className="hover:text-ink transition-colors">Settings</a>
            </nav>
          </header>
          {children}
          <footer className="mt-16 text-xs text-muted">
            Powered by ElevenLabs · OpenRouter (Seedance · Veo) · Kie.ai · Pexels · Unsplash · Anthropic · Cloudflare R2
          </footer>
        </div>
      </body>
    </html>
  );
}
