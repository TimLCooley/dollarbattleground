import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { cfgGet, cfgSet } from "@/lib/app-config";
import { normalizeShow, WAR_SHOW_KEY, type ShowConfig } from "@/lib/war-show";

// Admin control of the War Show: read the knobs, or patch them. The board
// picks changes up within a minute (the public endpoint caches for 30s and
// the board re-reads every couple of minutes).

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const raw = await cfgGet<unknown>(createAdminClient(), WAR_SHOW_KEY);
  return NextResponse.json(normalizeShow(raw));
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = createAdminClient();
  const body = (await req.json().catch(() => ({}))) as { patch?: Partial<ShowConfig> };
  if (!body.patch || typeof body.patch !== "object") {
    return NextResponse.json({ error: "patch?" }, { status: 400 });
  }
  const current = normalizeShow(await cfgGet<unknown>(db, WAR_SHOW_KEY));
  const next = normalizeShow({ ...current, ...body.patch });
  await cfgSet(db, WAR_SHOW_KEY, next);
  return NextResponse.json(next);
}
