import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { requireAdmin } from "@/lib/admin-auth";
import { dayNumber, medalFor, simulate, thresholds, validate, type Placement } from "@/lib/commander/engine";
import { getDay, histogram } from "@/lib/commander/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// One submission a day. The server re-scores the placements itself — a
// client-sent score is never trusted. Gold pays a 1×1 on the main map,
// perfect a 2×2 (enlisted players, once a day).
export async function POST(req: Request) {
  const isAdmin = !!(await requireAdmin());
  const { data: u } = await (await createClient()).auth.getUser();
  const user = u.user && !u.user.is_anonymous ? u.user : null;
  if (!user) return NextResponse.json({ error: "sign in to post your score" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { day?: number; placements?: Placement[]; side?: string };
  const today = dayNumber();
  if (body.day !== today) return NextResponse.json({ error: "that puzzle has ended — here's today's" }, { status: 409 });
  const placements = (Array.isArray(body.placements) ? body.placements : []).map((p) => ({ i: Math.floor(Number(p.i)), kind: p.kind }));

  const db = createAdminClient();
  const d = await getDay(db, today);
  const bad = validate(d.layout, placements);
  if (bad) return NextResponse.json({ error: bad }, { status: 400 });
  const { data: fc } = await db.from("free_claims").select("side").eq("user_id", user.id).maybeSingle();
  // the admin isn't enlisted on the main map — they play as the color picked on the puzzle screen
  const side = fc?.side ?? (isAdmin ? (body.side === "red" ? "red" : "blue") : null);
  if (!side) return NextResponse.json({ error: "enlist on the main map first", needsEnlist: true }, { status: 403 });

  const score = simulate(d.layout, placements).score;
  const medal = medalFor(score, d.optimal);
  // main-map rewards only for enlisted players
  const reward = !fc?.side ? null : medal === "perfect" ? "2x2" : medal === "gold" ? "1x1" : null;
  const { error } = await db
    .from("commander_scores")
    .insert({ day: today, user_id: user.id, side, placements, score, medal, reward });
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "you already submitted today" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // the insert is the once-a-day lock, so the reward can't be paid twice
  if (reward) await db.rpc("credit_bank", { p_owner: user.id, p_singles: reward === "1x1" ? 1 : 0, p_blocks: reward === "2x2" ? 1 : 0, p_strikes: 0 });

  return NextResponse.json({
    score,
    medal,
    reward,
    placements,
    optimal: d.optimal,
    solution: d.solution,
    thresholds: thresholds(d.optimal),
    histogram: await histogram(db, today),
  });
}
