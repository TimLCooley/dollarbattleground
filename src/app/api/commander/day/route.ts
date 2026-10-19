import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { dayNumber, thresholds } from "@/lib/commander/engine";
import { getDay, histogram } from "@/lib/commander/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// A day's map (?day=N, default today; future days stay hidden). The optimum
// and medal lines stay hidden until you've submitted for that day.
export async function GET(req: Request) {
  const isAdmin = !!(await requireAdmin());
  const db = createAdminClient();
  const today = dayNumber();
  const asked = Number(new URL(req.url).searchParams.get("day") ?? today);
  const day = Number.isInteger(asked) ? asked : today;
  if (day > today) return NextResponse.json({ error: "not yet", today }, { status: 404 });
  if (day < 1) return NextResponse.json({ error: "no such day", today }, { status: 404 });
  const d = await getDay(db, day);
  const { data: u } = await (await createClient()).auth.getUser();
  const user = u.user && !u.user.is_anonymous ? u.user : null;
  let side: string | null = null;
  let mine = null;
  if (user) {
    const [, { data: fc }, { data: sc }] = await Promise.all([
      // last seen, for the admin list
      db.from("player_seen").upsert({ user_id: user.id, seen_at: new Date().toISOString() }).then(() => ({ data: null })),
      db.from("free_claims").select("side").eq("user_id", user.id).maybeSingle(),
      db.from("commander_scores").select("score,medal,reward,placements").eq("day", day).eq("user_id", user.id).maybeSingle(),
    ]);
    side = fc?.side ?? null;
    mine = sc;
  }
  return NextResponse.json({
    day,
    today,
    layout: d.layout,
    side,
    signedIn: !!user,
    isAdmin,
    result: mine
      ? { ...mine, optimal: d.optimal, solution: d.solution, thresholds: thresholds(d.optimal), histogram: await histogram(db, day) }
      : null,
  });
}
