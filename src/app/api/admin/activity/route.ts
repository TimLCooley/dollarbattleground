import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";

// The activity ledger for the admin ACTIVITY tab: recent rows (optionally one
// kind group) plus 24h / 7d counts per kind.

const H = 60 * 60_000;

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = createAdminClient();
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind"); // e.g. "purchase" or a prefix like "email"
  const limit = Math.min(500, Number(url.searchParams.get("limit")) || 200);

  let q = db.from("activity").select("id,kind,faction,summary,meta,created_at").order("created_at", { ascending: false }).limit(limit);
  if (kind && kind !== "all") q = q.like("kind", `${kind}%`);
  const { data: rows, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const since7d = new Date(Date.now() - 7 * 24 * H).toISOString();
  const since24 = new Date(Date.now() - 24 * H).toISOString();
  const { data: week } = await db.from("activity").select("kind,created_at").gte("created_at", since7d).limit(5000);
  const d1: Record<string, number> = {};
  const d7: Record<string, number> = {};
  for (const r of (week ?? []) as { kind: string; created_at: string }[]) {
    d7[r.kind] = (d7[r.kind] ?? 0) + 1;
    if (r.created_at >= since24) d1[r.kind] = (d1[r.kind] ?? 0) + 1;
  }
  return NextResponse.json({ rows, counts: { d1, d7 } });
}
