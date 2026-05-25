import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const me = await getSessionUser();
  const { next } = await searchParams;
  if (me) redirect(next ?? "/");
  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <LoginForm next={next ?? "/"} />
    </div>
  );
}
