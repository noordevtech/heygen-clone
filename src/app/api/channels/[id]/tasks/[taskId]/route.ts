import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getChannel } from "@/lib/channels";
import { deleteChannelTask, updateChannelTask } from "@/lib/channel-tasks";
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

const PatchBody = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "no fields to update");

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, taskId } = await params;
  const channel = await getChannel(id);
  if (!channel || !canAccess(channel.userId, me)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const detail = first ? `${first.path.join(".") || "body"}: ${first.message}` : "validation failed";
    return NextResponse.json({ error: `Invalid request (${detail})` }, { status: 400 });
  }
  const task = await updateChannelTask(taskId, parsed.data);
  if (!task) {
    return NextResponse.json(
      { error: "Task not found or no longer pending" },
      { status: 404 },
    );
  }
  return NextResponse.json({ task });
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
