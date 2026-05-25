import { redirect } from "next/navigation";
import { listSettings } from "@/lib/settings";
import { SettingsForm } from "@/components/SettingsForm";
import { getSessionUser } from "@/lib/auth";
import { runWithUser } from "@/lib/user-context";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login?next=/settings");

  let settings: Awaited<ReturnType<typeof listSettings>> = [];
  let dbError: string | null = null;
  try {
    settings = await runWithUser(me.id, () => listSettings());
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className="space-y-6 max-w-3xl">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted">
          Configure the API keys used to generate voiceovers and videos. Keys are linked to
          your account — leaving one blank inherits the admin&apos;s default so the system
          still works out of the box.
        </p>
      </div>
      {dbError ? (
        <div className="card p-6 border-red-400/30">
          <div className="font-semibold text-red-400">Couldn&apos;t load settings</div>
          <p className="text-sm text-muted mt-2">
            The database isn&apos;t reachable yet. Make sure <code>DATABASE_URL</code> is configured and
            run <code>npm run migrate</code>.
          </p>
          <pre className="text-xs text-muted mt-3 whitespace-pre-wrap">{dbError}</pre>
        </div>
      ) : (
        <SettingsForm initial={settings} />
      )}
    </main>
  );
}
