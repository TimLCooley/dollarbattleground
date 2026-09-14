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
  freeUsed: boolean;
  score: number;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = createAdminClient();

  // 1) all auth users (paged)
  const users: User[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) break;
    users.push(...data.users);
    if (data.users.length < 200) break;
  }

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
  const { data: free } = await db.from("free_claims").select("user_id");
  const freeSet = new Set((free ?? []).map((f) => (f as { user_id: string }).user_id));

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
    const score = Math.round(spent * 10 + held + s.n * 2);
    return {
      id: u.id,
      email: u.email ?? null,
      team: teamBy.get(u.id) ?? null,
      isAdmin: isAdminUser(u),
      isAnon: Boolean(u.is_anonymous),
      created: u.created_at,
      held,
      spent,
      purchases: s.n,
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
