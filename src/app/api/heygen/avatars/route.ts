import { NextResponse } from "next/server";
import { listAvatars } from "@/lib/heygen";
import { withUser } from "@/lib/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withUser(async () => {
    try {
      const avatars = await listAvatars();
      return NextResponse.json({ avatars });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
