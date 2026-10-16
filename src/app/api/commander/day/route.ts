import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { dayNumber, thresholds } from "@/lib/commander/engine";
import { getDay, histogram } from "@/lib/commander/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Today's map. The optimum and medal lines stay hidden until you've submitted.
export async function GET() {
  const isAdmin = !!(await requireAdmin());
  if (process.env.NODE_ENV !== "development" && !isAdmin) return NextResponse.json({ error: "Not found" }, { status: 404 }); // admin-only for now
  const db = createAdminClient();
  const today = dayNumber();
  const d = await getDay(db, today);
  const { data: u } = await (await createClient()).auth.getUser();
  const user = u.user && !u.user.is_anonymous ? u.user : null;
  let side: string | null = null;
  let mine = null;
  if (user) {
    const [{ data: fc }, { data: sc }] = await Promise.all([
      db.from("free_claims").select("side").eq("user_id", user.id).maybeSingle(),
      db.from("commander_scores").select("score,medal,reward,placements").eq("day", today).eq("user_id", user.id).maybeSingle(),
    ]);
    side = fc?.side ?? null;
    mine = sc;
  }
  return NextResponse.json({
    day: today,
    layout: d.layout,
    side,
    signedIn: !!user,
    isAdmin,
    result: mine
      ? { ...mine, optimal: d.optimal, solution: d.solution, thresholds: thresholds(d.optimal), histogram: await histogram(db, today) }
      : null,
  });
}
