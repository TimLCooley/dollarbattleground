import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { cfgGet } from "@/lib/app-config";

// Public, read-only: the recruiting-campaign countdown, for the sign-in and
// claim screens ("N days left to join the founding class"). No player data.

export const revalidate = 60;

export async function GET() {
  try {
    const camp = await cfgGet<{ started_at?: string; ends_at?: string }>(createAdminClient(), "campaign");
    if (!camp?.ends_at) return NextResponse.json({ active: false, daysLeft: null, endsAt: null });
    const daysLeft = Math.max(0, Math.ceil((new Date(camp.ends_at).getTime() - Date.now()) / 86_400_000));
    return NextResponse.json({ active: daysLeft > 0, daysLeft, endsAt: camp.ends_at });
  } catch {
    return NextResponse.json({ active: false, daysLeft: null, endsAt: null });
  }
}
