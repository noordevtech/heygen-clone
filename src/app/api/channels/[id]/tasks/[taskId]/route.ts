import { NextRequest, NextResponse } from "next/server";
import { getChannel } from "@/lib/channels";
import { deleteChannelTask } from "@/lib/channel-tasks";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canAccess(
  channelOwner: string | null,
  me: { id: string; role: "admin" | "user" },
): boolean {
  if (me.role === "admin") return true;
  if (channelOwner == null) return false;
  return channelOwner === me.id;
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, taskId } = await params;
  const channel = await getChannel(id);
  if (!channel || !canAccess(channel.userId, me)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // deleteChannelTask only removes pending tasks — running/done/error rows
  // stay as an audit trail. If it returns false either the task is gone or
  // already in flight; surface as 404/409 alike.
  const ok = await deleteChannelTask(taskId);
  if (!ok) {
    return NextResponse.json(
      { error: "Task not found or already running" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
