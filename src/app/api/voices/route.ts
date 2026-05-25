import { NextResponse } from "next/server";
import { listVoices } from "@/lib/elevenlabs";
import { withUser } from "@/lib/route-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withUser(async () => {
    try {
      const voices = await listVoices();
      return NextResponse.json({ voices });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
