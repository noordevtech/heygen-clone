import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getChannel } from "@/lib/channels";
import { createChannelTask, listChannelTasks } from "@/lib/channel-tasks";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Channel rows are owned by a user. Admin can see/edit any row; everyone
 *  else can only touch their own. Mirrors the rule in /api/channels/[id]. */
function canAccess(
  channelOwner: string | null,
  me: { id: string; role: "admin" | "user" },
): boolean {
  if (me.role === "admin") return true;
  if (channelOwner == null) return false;
  return channelOwner === me.id;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const channel = await getChannel(id);
  if (!channel || !canAccess(channel.userId, me)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const tasks = await listChannelTasks(id);
  return NextResponse.json({ tasks });
}

const Body = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
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
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const detail = first ? `${first.path.join(".") || "body"}: ${first.message}` : "validation failed";
    return NextResponse.json({ error: `Invalid request (${detail})` }, { status: 400 });
  }
  const task = await createChannelTask({
    channelId: id,
    // Tasks are owned by the channel owner, not necessarily the admin who
    // happens to be POSTing. Keeps per-user scoping consistent.
    userId: channel.userId ?? me.id,
    title: parsed.data.title,
    description: parsed.data.description,
  });
  return NextResponse.json({ task }, { status: 201 });
}
