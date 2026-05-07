import { listSettings } from "@/lib/settings";
import { SettingsForm } from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let settings: Awaited<ReturnType<typeof listSettings>> = [];
  let dbError: string | null = null;
  try {
    settings = await listSettings();
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="space-y-6 max-w-3xl">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-[#9aa0b4]">
          Configure the API keys used to generate voiceovers and videos. Changes apply immediately to
          new generation jobs.
        </p>
      </div>
      {dbError ? (
        <div className="card p-6 border-red-400/30">
          <div className="font-semibold text-red-400">Couldn't load settings</div>
          <p className="text-sm text-[#9aa0b4] mt-2">
            The database isn't reachable yet. Make sure <code>DATABASE_URL</code> is configured and
            run <code>npm run migrate</code>.
          </p>
          <pre className="text-xs text-[#9aa0b4] mt-3 whitespace-pre-wrap">{dbError}</pre>
        </div>
      ) : (
        <SettingsForm initial={settings} />
      )}
    </main>
  );
}
