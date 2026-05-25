import { redirect } from "next/navigation";
import { AdminPanel } from "@/components/AdminPanel";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const me = await getSessionUser();
  if (!me) redirect("/login?next=/admin");
  if (me.role !== "admin") redirect("/");
  return (
    <main className="max-w-7xl mx-auto space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Admin</h1>
        <p className="text-base text-muted">
          Create accounts and activate them so users can sign in. Inactive
          accounts are blocked from logging in.
        </p>
      </div>
      <AdminPanel currentUserId={me.id} />
    </main>
  );
}
