import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { cfgGet } from "@/lib/app-config";
import { getGate } from "@/lib/gate";

// Public, read-only: the recruiting-campaign countdown for the wall, the
// sign-in and claim screens ("N days left to enlist"), plus whether the gates
// are open. No player data.

export const revalidate = 60;

export async function GET() {
  try {
    const db = createAdminClient();
    const [camp, gate] = await Promise.all([cfgGet<{ started_at?: string; ends_at?: string }>(db, "campaign"), getGate(db)]);
    if (!camp?.ends_at) return NextResponse.json({ active: false, daysLeft: null, endsAt: null, gateOpen: gate.open });
    const daysLeft = Math.max(0, Math.ceil((new Date(camp.ends_at).getTime() - Date.now()) / 86_400_000));
    return NextResponse.json({ active: daysLeft > 0, daysLeft, endsAt: camp.ends_at, gateOpen: gate.open });
  } catch {
    return NextResponse.json({ active: false, daysLeft: null, endsAt: null, gateOpen: false });
  }
}
