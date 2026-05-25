import { redirect } from "next/navigation";
import { listJobs } from "@/lib/jobs";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login?next=/jobs");
  // Each user only sees their own jobs. Admin's existing jobs remain
  // visible to the admin (their user_id is on those rows already).
  const jobs = await listJobs(me.id);
  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Jobs</h1>
      {jobs.length === 0 ? (
        <div className="card p-6 text-muted">No jobs yet. Head to the Studio or YouTube tab to create one.</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobs.map((j) => {
            const r = j.request;
            const summary =
              r.kind === "longform"
                ? r.title || `${r.scenes.length} scenes`
                : r.script.slice(0, 200);
            return (
              <div key={j.id} className="card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="chip">{j.status}</span>
                  <span className="text-xs text-muted">
                    {new Date(j.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm line-clamp-3 text-ink">{summary}</div>
                {j.videoUrl && (
                  <video controls className="w-full rounded-lg bg-black" src={j.videoUrl} />
                )}
                <div className="flex flex-wrap gap-2 text-xs text-muted">
                  <span className="chip">
                    {r.kind === "longform" ? "longform" : "reel"}
                  </span>
                  {r.kind === "longform" && (
                    <>
                      <span className="chip">{r.scenes.length} scenes</span>
                      {r.generateMusic && <span className="chip">+music</span>}
                    </>
                  )}
                  {(r.kind === undefined || r.kind === "reel") && (
                    <>
                      <span className="chip">{r.videoModelId}</span>
                      <span className="chip">{r.aspect}</span>
                      {r.avatar && <span className="chip">avatar</span>}
                      {r.generateImage && <span className="chip">+image</span>}
                      {r.generateMusic && <span className="chip">+music</span>}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
