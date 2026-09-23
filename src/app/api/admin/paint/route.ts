import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { cellsFor, isValidCenter, type ActionKind } from "@/lib/board-patterns";

// Admin god-mode paint. Reuses the same server-authoritative claim_paid RPC that
// Stripe fulfillment uses, but free (0 cents) and gated to admins only. Lets the
// owner paint either side on /both for testing/managing without paying.
export async function POST(req: Request) {
  const adminId = await requireAdmin();
  if (!adminId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    center?: unknown;
    kind?: unknown;
    team?: unknown;
  } | null;
  const center = body?.center;
  const kind = body?.kind as ActionKind;
  const team = body?.team;

  if (
    !isValidCenter(center) ||
    (kind !== "flip" && kind !== "x" && kind !== "strike") ||
    (team !== "red" && team !== "blue")
  ) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const cells = cellsFor(kind, center);
  const admin = createAdminClient();
  const { error } = await admin.rpc("claim_paid", {
    p_cells: cells,
    p_team: team,
    p_owner: adminId,
    p_amount_cents: 0,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, painted: cells.length });
}
