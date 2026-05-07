import { listJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const jobs = await listJobs();
  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-semibold">Jobs</h1>
      {jobs.length === 0 ? (
        <div className="card p-6 text-muted">No jobs yet. Head to the Studio or YouTube tab to create one.</div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobs.map((j) => {
            const r = j.request;
            const isLongform = r.kind === "longform";
            const summary = isLongform
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
                  <span className="chip">{isLongform ? "longform" : "reel"}</span>
                  {isLongform ? (
                    <>
                      <span className="chip">{r.scenes.length} scenes</span>
                      {r.generateMusic && <span className="chip">+music</span>}
                    </>
                  ) : (
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
