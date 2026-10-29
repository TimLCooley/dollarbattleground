import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { dayNumber, thresholds } from "@/lib/commander/engine";
import { getDay, histogram } from "@/lib/commander/server";
import { commanderRank, type CmdRank } from "@/lib/commander/rank";
import { skinById, skinColors } from "@/lib/commander/skins";

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
  let rank: CmdRank | null = null;
  let skin: { id: string; me: string; them: string; art?: string } | null = null;
  // guests (anonymous sessions) can attack too — show them their own result
  if (!user && u.user) {
    const { data: sc } = await db.from("commander_scores").select("score,medal,reward,placements").eq("day", day).eq("user_id", u.user.id).maybeSingle();
    mine = sc;
  }
  if (user) {
    const [, { data: fc }, { data: sc }, { data: all }, { data: prof }] = await Promise.all([
      // last seen, for the admin list
      db.from("player_seen").upsert({ user_id: user.id, seen_at: new Date().toISOString() }).then(() => ({ data: null })),
      db.from("free_claims").select("side").eq("user_id", user.id).maybeSingle(),
      db.from("commander_scores").select("score,medal,reward,placements").eq("day", day).eq("user_id", user.id).maybeSingle(),
      db.from("commander_scores").select("day,medal,created_at").eq("user_id", user.id),
      db.from("commander_profile").select("rank_floor,officer_since,skin,custom_colors,shuffle,skin_pool").eq("user_id", user.id).maybeSingle(),
    ]);
    // ranks count the days you played that day's own puzzle (past days don't)
    const plays = ((all ?? []) as { day: number; medal: string | null; created_at: string }[])
      .filter((p) => dayNumber(new Date(p.created_at)) === p.day)
      .map((p) => ({ day: p.day, perfect: p.medal === "perfect" }));
    // shuffle: each load picks one of the skins switched on in the store
    const pool = (prof?.skin_pool ?? []) as string[];
    const chosen = prof?.shuffle && pool.length ? pool[Math.floor(Math.random() * pool.length)] : prof?.skin;
    if (chosen && chosen !== "classic") {
      const c = skinColors(chosen, prof?.custom_colors, fc?.side === "red" ? "red" : "blue");
      skin = { id: chosen, ...c, art: skinById(chosen)?.art };
    }
    rank = commanderRank(plays, today, {
      floorKey: prof?.rank_floor ?? null,
      officerSinceDay: prof?.officer_since ? dayNumber(new Date(prof.officer_since)) : null,
    });
    side = fc?.side ?? null;
    mine = sc;
  }
  return NextResponse.json({
    day,
    today,
    layout: d.layout,
    side,
    signedIn: !!user,
    rank,
    skin,
    isAdmin,
    result: mine
      ? { ...mine, optimal: d.optimal, solution: d.solution, thresholds: thresholds(d.optimal), histogram: await histogram(db, day) }
      : null,
  });
}
