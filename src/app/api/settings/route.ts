import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listSettings, setSetting, SETTING_KEYS, type SettingKey } from "@/lib/settings";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const settings = await listSettings();
  return NextResponse.json({ settings });
}

const SettingsBody = z.object({
  updates: z
    .array(
      z.object({
        key: z.enum(SETTING_KEYS as unknown as [SettingKey, ...SettingKey[]]),
        value: z.string().nullable(),
      }),
    )
    .min(1),
});

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = SettingsBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });
  }
  for (const u of parsed.data.updates) {
    await setSetting(u.key, u.value);
  }
  const settings = await listSettings();
  return NextResponse.json({ settings });
}
