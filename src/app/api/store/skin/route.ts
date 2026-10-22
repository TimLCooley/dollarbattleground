import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { ownedItems } from "@/lib/store";
import { requireAdmin } from "@/lib/admin-auth";
import { isHex, owns, skinById } from "@/lib/commander/skins";

export const dynamic = "force-dynamic";

// POST — choose how your board looks (only skins you own, or the free ones):
//   {skin, custom?}   play with one skin (custom = two #rrggbb colors)
//   {shuffle: bool}   shuffle on/off — on: every load picks from your pool
//   {pool: [ids]}     the skins switched on while shuffling
export async function POST(req: Request) {
  const { data: u } = await (await createClient()).auth.getUser();
  const user = u.user && !u.user.is_anonymous ? u.user : null;
  if (!user) return NextResponse.json({ error: "Log in to choose a skin." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { skin?: string; custom?: { me?: string; them?: string }; shuffle?: boolean; pool?: string[] };
  // the admin can equip anything, to test skins before they go on sale
  const owned = (await requireAdmin()) ? ["all"] : await ownedItems(user.id);
  const db = createAdminClient();
  const { data: prof } = await db.from("commander_profile").select("skin,skin_pool,shuffle").eq("user_id", user.id).maybeSingle();
  const row: Record<string, unknown> = { user_id: user.id, updated_at: new Date().toISOString() };

  if (body.skin !== undefined) {
    if (!skinById(body.skin)) return NextResponse.json({ error: "No such skin." }, { status: 400 });
    if (!owns(owned, body.skin)) return NextResponse.json({ error: "Buy this skin first." }, { status: 403 });
    row.skin = body.skin;
  }
  if (body.custom !== undefined) {
    const c = body.custom;
    if (!c || !isHex(c.me) || !isHex(c.them)) return NextResponse.json({ error: "Pick two colors." }, { status: 400 });
    if (c.me.toLowerCase() === c.them.toLowerCase()) return NextResponse.json({ error: "Pick two different colors." }, { status: 400 });
    row.custom_colors = { me: c.me.toLowerCase(), them: c.them.toLowerCase() };
  }
  if (body.pool !== undefined) {
    const pool = [...new Set(body.pool)].filter((id) => skinById(id) && owns(owned, id));
    row.skin_pool = pool;
  }
  if (body.shuffle !== undefined) {
    row.shuffle = !!body.shuffle;
    // starting to shuffle: begin with the skin you're using
    if (body.shuffle && body.pool === undefined && !(prof?.skin_pool ?? []).length) row.skin_pool = [prof?.skin ?? "classic"];
  }
  const { error } = await db.from("commander_profile").upsert(row, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: "Couldn't save that — try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
