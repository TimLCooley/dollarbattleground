import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { SUPER_ADMIN_EMAIL } from "@/lib/admin-shared";

// Tile ownership log. Default: recent flips across the board. With ?x=&y=: the
// full ownership history of one cell (all owners, newest first). Owner ids are
// enriched with email/short-id + each player's action points, so the agents (and
// you) can see who to target. Admin-only.

export async function GET(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const xs = url.searchParams.get("x");
  const ys = url.searchParams.get("y");
  const limit = Math.min(Number(url.searchParams.get("limit")) || 60, 200);

  const db = createAdminClient();

  // "Most fought-for" mode: aggregate flips per cell within a date range.
  if (url.searchParams.get("hot")) {
    const since = url.searchParams.get("since");
    const until = url.searchParams.get("until");
    let q = db
      .from("tile_events")
      .select("x,y,team,created_at")
      .order("created_at", { ascending: false })
      .limit(8000);
    if (since) q = q.gte("created_at", since);
    if (until) q = q.lte("created_at", until);
    const { data, error: hErr } = await q;
    if (hErr) {
      return NextResponse.json({ error: hErr.message }, { status: 500 });
    }
    const cells = new Map<
      string,
      { x: number; y: number; flips: number; red: number; blue: number; team: string; last: string }
    >();
    for (const e of data ?? []) {
      const key = `${e.x},${e.y}`;
      let c = cells.get(key);
      if (!c) {
        // events arrive newest-first, so the first one seen is the current owner
        c = { x: e.x, y: e.y, flips: 0, red: 0, blue: 0, team: e.team, last: e.created_at };
        cells.set(key, c);
      }
      c.flips++;
      if (e.team === "red") c.red++;
      else if (e.team === "blue") c.blue++;
    }
    const rows = [...cells.values()]
      .sort((a, b) => b.flips - a.flips || b.last.localeCompare(a.last))
      .slice(0, 24);
    return NextResponse.json({ hot: true, rows, total: cells.size });
  }
  let query = db
    .from("tile_events")
    .select("id,x,y,team,owner_id,source,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  const cellMode = xs !== null && ys !== null;
  if (cellMode) {
    query = query.eq("x", Number(xs)).eq("y", Number(ys));
  }
  const { data: events, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich owners: email/short-id + action points.
  const ownerIds = [...new Set((events ?? []).map((e) => e.owner_id).filter(Boolean))] as string[];
  const ownerInfo = new Map<string, { label: string; actions: number }>();

  const { data: stats } = await db
    .from("player_stats")
    .select("user_id,actions")
    .in("user_id", ownerIds.length ? ownerIds : ["00000000-0000-0000-0000-000000000000"]);
  const actionsBy = new Map<string, number>();
  for (const s of stats ?? []) {
    actionsBy.set((s as { user_id: string }).user_id, (s as { actions: number }).actions);
  }

  await Promise.all(
    ownerIds.map(async (id) => {
      let label = `anon · ${id.slice(0, 8)}`;
      try {
        const { data } = await db.auth.admin.getUserById(id);
        const email = data.user?.email;
        if (email) label = email === SUPER_ADMIN_EMAIL ? `★ ${email}` : email;
      } catch {
        /* keep short id */
      }
      ownerInfo.set(id, { label, actions: actionsBy.get(id) ?? 0 });
    }),
  );

  const rows = (events ?? []).map((e) => {
    const info = e.owner_id ? ownerInfo.get(e.owner_id) : undefined;
    return {
      id: e.id,
      x: e.x,
      y: e.y,
      team: e.team,
      source: e.source,
      created: e.created_at,
      owner: info?.label ?? "—",
      ownerActions: info?.actions ?? 0,
    };
  });

  return NextResponse.json({ cellMode, rows });
}
