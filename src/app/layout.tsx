import type { Metadata } from "next";
import "./globals.css";
import { TopNav } from "@/components/TopNav";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "AI Reels Studio",
  description: "Generate AI reels & feed videos for TikTok, Instagram and Facebook.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await getSessionUser();
  return (
    <html lang="en">
      <body className="font-sans">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <header className="flex items-center justify-between mb-10 gap-4">
            <a href="/" className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-accent2" />
              <div className="font-semibold text-lg text-ink">AI Reels Studio</div>
            </a>
            <TopNav user={me ? { email: me.email, role: me.role } : null} />
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
