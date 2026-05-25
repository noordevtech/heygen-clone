import { NextRequest, NextResponse } from "next/server";
import { runChannelAgentAndQueue } from "@/lib/channel-runner";
import { getChannel } from "@/lib/channels";
import { getSessionUser } from "@/lib/auth";
import { runWithUser } from "@/lib/user-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const channel = await getChannel(id);
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  if (me.role !== "admin" && channel.userId !== me.id) {
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }
  // Run the agent pipeline in the channel-owner's context so their API keys
  // are used (admin's used as fallback for any key the owner hasn't set).
  const ownerId = channel.userId ?? me.id;
  try {
    const result = await runWithUser(ownerId, () => runChannelAgentAndQueue(id));
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fire failed";
    const status = message === "Channel not found" ? 404 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
