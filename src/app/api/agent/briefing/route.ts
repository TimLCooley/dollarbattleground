import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  generateBriefing,
  isBrainConfigured,
  type PlayerSituation,
  type Briefing,
} from "@/lib/agent-brain";

// Field Command speaks to THIS player: reads their live situation (side, tiles,
// action points, who just flipped them, board balance) and asks Gemini for an
// in-character line that provokes one buyable move. Cached briefly per player to
// control cost, logged to agent_events. Falls back to null so the radio uses
// canned copy.

const CACHE = new Map<string, { at: number; briefing: Briefing }>();
const TTL_MS = 3 * 60 * 1000;

export async function POST(req: Request) {
  if (!isBrainConfigured()) {
    return NextResponse.json({ briefing: null });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ briefing: null });

  let clientSide: "red" | "blue" | undefined;
  let rank: string | undefined;
  try {
    const b = (await req.json()) as { side?: "red" | "blue"; rank?: string };
    clientSide = b.side;
    rank = b.rank;
  } catch {
    /* no body */
  }

  const cached = CACHE.get(user.id);
  if (cached && Date.now() - cached.at < TTL_MS) {
    return NextResponse.json({ briefing: cached.briefing, cached: true });
  }

  const db = createAdminClient();

  // Stats + side
  const { data: stat } = await db
    .from("player_stats")
    .select("actions,captures,side")
    .eq("user_id", user.id)
    .maybeSingle();
  const side = (stat?.side as "red" | "blue" | null) ?? clientSide ?? null;
  const enemy = side === "blue" ? "red" : "blue";

  // Board balance + tiles held + enemy pressure
  const [{ data: mine }, { data: allTiles }, { data: enemyEvents }] =
    await Promise.all([
      db.from("tiles").select("x,y").eq("owner_id", user.id),
      db.from("tiles").select("team"),
      db
        .from("tile_events")
        .select("x,y,created_at")
        .eq("team", enemy)
        .gte("created_at", new Date(Date.now() - 3600_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  let blue = 0;
  let red = 0;
  for (const t of allTiles ?? []) {
    if ((t as { team: string }).team === "blue") blue++;
    else if ((t as { team: string }).team === "red") red++;
  }

  // One of the player's positions the enemy just took (retaliation hook):
  // a cell in their ownership history whose current owner is now the enemy.
  let lastTakenCell: { x: number; y: number } | null = null;
  const { data: hist } = await db
    .from("tile_events")
    .select("x,y")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(25);
  const mineSet = new Set((mine ?? []).map((t) => `${t.x},${t.y}`));
  for (const h of hist ?? []) {
    const key = `${h.x},${h.y}`;
    if (!mineSet.has(key)) {
      // they used to be here but don't hold it now
      const flippedByEnemy = (enemyEvents ?? []).some(
        (e) => e.x === h.x && e.y === h.y,
      );
      if (flippedByEnemy) {
        lastTakenCell = { x: h.x, y: h.y };
        break;
      }
    }
  }

  const situation: PlayerSituation = {
    side,
    held: mine?.length ?? 0,
    actions: stat?.actions ?? 0,
    captures: stat?.captures ?? 0,
    blue,
    red,
    enemyRecent: enemyEvents?.length ?? 0,
    lastTakenCell,
    rank,
  };

  // The active board_manager agent's persona (fallback to a default).
  const { data: agent } = await db
    .from("agents")
    .select("name,personality,active")
    .eq("slug", "board_manager")
    .maybeSingle();
  if (agent && agent.active === false) {
    return NextResponse.json({ briefing: null });
  }
  const name = agent?.name ?? "Field Command";
  const persona =
    agent?.personality ??
    "The cool tactician narrating the battle, stoking FOMO and momentum swings.";

  const briefing = await generateBriefing(name, persona, situation);
  if (!briefing) return NextResponse.json({ briefing: null });

  CACHE.set(user.id, { at: Date.now(), briefing });

  // Log it for the admin Agents activity feed (best-effort).
  db.from("agent_events")
    .insert({
      agent_slug: "board_manager",
      kind: "message",
      summary: briefing.line,
      meta: { nudge: briefing.nudge, target: user.id, side },
    })
    .then(() => {});

  return NextResponse.json({ briefing });
}
