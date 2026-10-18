import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { requireAdmin, isAdminUser } from "@/lib/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { getModeStripe } from "@/lib/stripe-mode";

// The command roster: every auth user with derived activity — tiles held, total
// spent + purchase count (Stripe), whether they took their free tile, admin
// flag, and an activity score. Sourced from the auth admin API + tiles +
// free_claims (no profiles table needed). Admin-only.

export interface RosterRow {
  id: string;
  email: string | null;
  team: string | null;
  isAdmin: boolean;
  isAnon: boolean;
  created: string;
  held: number;
  spent: number;
  purchases: number;
  actions: number;
  lastActionAt: string | null;
  freeUsed: boolean;
  score: number;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = createAdminClient();

  // 1) all auth users (paged)
  // real (non-anonymous) accounts only, straight from the database — paging the
  // auth API capped out once every visitor got an anonymous session
  const { data: realUsers } = await db.rpc("admin_real_users");
  const users = (realUsers ?? []) as unknown as User[];

  // 2) tiles held + team per owner
  const { data: tiles } = await db
    .from("tiles")
    .select("owner_id,team")
    .not("owner_id", "is", null);
  const heldBy = new Map<string, number>();
  const teamBy = new Map<string, string>();
  for (const t of tiles ?? []) {
    const row = t as { owner_id: string; team: string | null };
    heldBy.set(row.owner_id, (heldBy.get(row.owner_id) ?? 0) + 1);
    if (row.team) teamBy.set(row.owner_id, row.team);
  }

  // 3) free-tile usage
  const { data: free } = await db.from("free_claims").select("user_id,side");
  const freeSet = new Set((free ?? []).map((f) => (f as { user_id: string }).user_id));
  // The side a player enlisted with is permanent — holding zero squares right
  // now doesn't make them sideless.
  const enlistedSide = new Map((free ?? []).map((f) => [(f as { user_id: string }).user_id, (f as { side: string | null }).side]));

  // 3b) action points from player_stats
  const { data: stats } = await db
    .from("player_stats")
    .select("user_id,actions,last_action_at");
  const statsBy = new Map<string, { actions: number; last: string | null }>();
  for (const s of stats ?? []) {
    const row = s as { user_id: string; actions: number; last_action_at: string | null };
    statsBy.set(row.user_id, { actions: row.actions, last: row.last_action_at });
  }

  // 4) Stripe spend by supabase_user_id (mode-aware)
  const spentBy = new Map<string, { amt: number; n: number }>();
  try {
    const stripe = await getModeStripe();
    let starting_after: string | undefined;
    for (let p = 0; p < 5; p++) {
      const charges = await stripe.charges.list({ limit: 100, starting_after });
      for (const c of charges.data) {
        if (!c.paid) continue;
        const uid = c.metadata?.supabase_user_id;
        if (!uid) continue;
        const cur = spentBy.get(uid) ?? { amt: 0, n: 0 };
        cur.amt += c.amount;
        cur.n += 1;
        spentBy.set(uid, cur);
      }
      if (!charges.has_more) break;
      starting_after = charges.data[charges.data.length - 1]?.id;
    }
  } catch {
    /* Stripe unreachable — spend stays 0 */
  }

  const rows: RosterRow[] = users.map((u) => {
    const held = heldBy.get(u.id) ?? 0;
    const s = spentBy.get(u.id) ?? { amt: 0, n: 0 };
    const spent = s.amt / 100;
    const st = statsBy.get(u.id);
    const actions = st?.actions ?? 0;
    const score = Math.round(spent * 10 + held + actions * 2);
    return {
      id: u.id,
      email: u.email ?? null,
      team: enlistedSide.get(u.id) ?? teamBy.get(u.id) ?? null,
      isAdmin: isAdminUser(u),
      isAnon: Boolean(u.is_anonymous),
      created: u.created_at,
      held,
      spent,
      purchases: s.n,
      actions,
      lastActionAt: st?.last ?? null,
      freeUsed: freeSet.has(u.id),
      score,
    };
  });

  return NextResponse.json({
    rows,
    summary: {
      users: rows.length,
      active: rows.filter((r) => r.score > 0).length,
      revenue: rows.reduce((a, r) => a + r.spent, 0),
      payers: rows.filter((r) => r.spent > 0).length,
    },
  });
}
