import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";

// Admin view / play as a player — the admin stays signed in as themself.
// GET ?id= → the player's side, rank inputs and banked pieces.
// POST {id, center, kind} → places one of their banked pieces as them.

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id?" }, { status: 400 });
  const db = createAdminClient();
  const [{ data: u }, { data: fc }, { data: bank }, { count: captures }, { data: stats }] = await Promise.all([
    db.auth.admin.getUserById(id),
    db.from("free_claims").select("side,founding_officer,created_at").eq("user_id", id).maybeSingle(),
    db.from("flip_bank").select("singles,blocks,strikes").eq("user_id", id).maybeSingle(),
    db.from("tile_events").select("id", { count: "exact", head: true }).eq("owner_id", id),
    db.from("player_stats").select("spent_cents").eq("user_id", id).maybeSingle(),
  ]);
  if (!fc) return NextResponse.json({ error: "this player hasn't taken a position yet" }, { status: 404 });
  const claim = fc as { side: string; founding_officer: boolean; created_at: string };
  let founderNo: number | null = null;
  if (claim.founding_officer) {
    const { count } = await db.from("free_claims").select("user_id", { count: "exact", head: true }).eq("founding_officer", true).lte("created_at", claim.created_at);
    founderNo = count ?? null;
  }
  const b = (bank ?? { singles: 0, blocks: 0, strikes: 0 }) as { singles: number; blocks: number; strikes: number };
  return NextResponse.json({
    id,
    email: u?.user?.email ?? null,
    side: claim.side,
    joined: claim.created_at,
    captures: captures ?? 0,
    isOfficer: claim.founding_officer || Number((stats as { spent_cents?: number } | null)?.spent_cents ?? 0) >= 500,
    foundingNumber: founderNo,
    bank: { singles: b.singles ?? 0, blocks: b.blocks ?? 0, strikes: b.strikes ?? 0 },
  });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { id?: string; center?: number; kind?: string; team?: string };
  if (!body.id || typeof body.center !== "number" || !["flip", "x", "strike"].includes(body.kind ?? "") || !["red", "blue"].includes(body.team ?? "")) {
    return NextResponse.json({ error: "id, center, kind, team required" }, { status: 400 });
  }
  const { data, error } = await createAdminClient().rpc("claim_banked_as", { p_uid: body.id, p_center: body.center, p_kind: body.kind, p_team: body.team });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (data === -1) return NextResponse.json({ error: "no piece of that kind left in their bank" }, { status: 409 });
  return NextResponse.json({ ok: true, tiles: data });
}
