import { TasksTable } from "@/components/TasksTable";

export const dynamic = "force-dynamic";

export default function TasksPage() {
  return (
    <main className="space-y-8 max-w-7xl mx-auto">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Tasks</h1>
        <p className="text-base text-muted">
          Each channel runs the full agent pipeline at its scheduled time — brainstorm,
          script, render, SEO, thumbnail, captions, and upload to YouTube. Click a channel
          name to see every video it has published.
        </p>
      </div>
      <TasksTable />
    </main>
  );
}
