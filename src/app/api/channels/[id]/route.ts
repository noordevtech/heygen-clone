import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteChannel, getChannel, updateChannel } from "@/lib/channels";
import { STYLE_PRESETS } from "@/lib/catalog";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STYLE_IDS = STYLE_PRESETS.map((s) => s.id) as [string, ...string[]];

/** Channel rows are owned by a user. Admin can see/edit any row; everyone
 *  else can only touch their own. */
function canAccess(
  channelOwner: string | null,
  me: { id: string; role: "admin" | "user" },
): boolean {
  if (me.role === "admin") return true;
  // Legacy rows with no owner were backfilled to the admin in 0009, so a
  // null owner here would be unusual — treat it as admin-only.
  if (channelOwner == null) return false;
  return channelOwner === me.id;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const channel = await getChannel(id);
    if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canAccess(channel.userId, me)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ channel });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch channel";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const PatchBody = z
  .object({
    name: z.string().min(1).max(200).optional(),
    niche: z.string().min(1).max(400).optional(),
    schedule: z.enum(["daily", "weekly", "monthly"]).optional(),
    runTime: z
      .string()
      .regex(/^\d{1,2}:\d{2}$/, "runTime must be HH:MM (24h)")
      .optional(),
    targetLengthMin: z.number().int().min(1).max(60).optional(),
    style: z.enum(STYLE_IDS).optional(),
    brief: z.string().max(8000).nullable().optional(),
    youtubeConnectionId: z.string().uuid().nullable().optional(),
    voiceId: z.string().min(1).max(100).nullable().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, "no fields to update");

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await getChannel(id);
  if (!existing || !canAccess(existing.userId, me)) {
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
    return NextResponse.json(
      { error: `Invalid request (${detail})`, issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const runTime = parsed.data.runTime
      ? parsed.data.runTime.replace(/^(\d):/, "0$1:")
      : undefined;
    const channel = await updateChannel(id, { ...parsed.data, runTime });
    if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ channel });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await getChannel(id);
  if (!existing || !canAccess(existing.userId, me)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const ok = await deleteChannel(id);
    if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
