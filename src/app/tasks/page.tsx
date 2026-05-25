import { TasksTable } from "@/components/TasksTable";

export const dynamic = "force-dynamic";

export default function TasksPage() {
  return (
    <main className="space-y-6">
      <div className="space-y-2 max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <p className="text-sm text-muted">
          Track the channels and niches you&apos;re producing for. Each row holds a channel name,
          its niche, and when you added it.
        </p>
      </div>
      <TasksTable />
    </main>
  );
}
