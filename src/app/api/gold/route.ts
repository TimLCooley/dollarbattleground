import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { cfgGet } from "@/lib/app-config";

// Public: when the next gold square drops (for the board's countdown).
export const revalidate = 30;
export async function GET() {
  try {
    const next = await cfgGet<{ at?: string }>(createAdminClient(), "gold_next");
    return NextResponse.json({ next_at: next?.at ?? null });
  } catch {
    return NextResponse.json({ next_at: null });
  }
}
