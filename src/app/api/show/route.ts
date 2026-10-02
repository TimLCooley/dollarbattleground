import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { cfgGet } from "@/lib/app-config";
import { normalizeShow, SHOW_DEFAULTS, WAR_SHOW_KEY } from "@/lib/war-show";

// Public, read-only: the War Show knobs the board plays by. No player data —
// just whether the show is on and how it paces itself. Cached briefly so a
// busy board doesn't hit the database on every visit.

export const revalidate = 30;

export async function GET() {
  try {
    const raw = await cfgGet<unknown>(createAdminClient(), WAR_SHOW_KEY);
    return NextResponse.json(normalizeShow(raw));
  } catch {
    return NextResponse.json(SHOW_DEFAULTS);
  }
}
