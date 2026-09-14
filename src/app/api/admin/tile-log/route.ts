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
