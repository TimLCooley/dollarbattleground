import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { ownedItems } from "@/lib/store";
import { isHex, owns, skinById } from "@/lib/commander/skins";

export const dynamic = "force-dynamic";

// POST {skin, custom?} — switch the skin you play with (only ones you own, or
// the free ones). Custom colors are two #rrggbb values.
export async function POST(req: Request) {
  const { data: u } = await (await createClient()).auth.getUser();
  const user = u.user && !u.user.is_anonymous ? u.user : null;
  if (!user) return NextResponse.json({ error: "Log in to choose a skin." }, { status: 401 });
  const { skin, custom } = (await req.json().catch(() => ({}))) as { skin?: string; custom?: { me?: string; them?: string } };
  if (!skin || !skinById(skin)) return NextResponse.json({ error: "No such skin." }, { status: 400 });
  if (!owns(await ownedItems(user.id), skin)) return NextResponse.json({ error: "Buy this skin first." }, { status: 403 });
  let colors = null;
  if (skin === "custom") {
    if (!custom || !isHex(custom.me) || !isHex(custom.them)) return NextResponse.json({ error: "Pick two colors." }, { status: 400 });
    if (custom.me.toLowerCase() === custom.them.toLowerCase()) return NextResponse.json({ error: "Pick two different colors." }, { status: 400 });
    colors = { me: custom.me.toLowerCase(), them: custom.them.toLowerCase() };
  }
  const db = createAdminClient();
  const row: Record<string, unknown> = { user_id: user.id, skin, updated_at: new Date().toISOString() };
  if (colors) row.custom_colors = colors;
  const { error } = await db.from("commander_profile").upsert(row, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: "Couldn't save that — try again." }, { status: 500 });
  return NextResponse.json({ ok: true, skin, custom: colors });
}
