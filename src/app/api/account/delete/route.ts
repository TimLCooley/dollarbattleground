import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

// Delete the signed-in player's account for real: their positions become
// unowned (the map keeps its colors), their stats/prefs/claims go, and the
// auth user is removed. Payment records stay with Stripe (legal retention).

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const db = createAdminClient();
  const id = user.id;
  await db.from("tiles").update({ owner_id: null }).eq("owner_id", id);
  await db.from("activity").update({ actor: null }).eq("actor", id);
  await db.from("email_prefs").delete().eq("user_id", id);
  await db.from("email_log").update({ user_id: null }).eq("user_id", id);
  await db.from("tile_takeovers").delete().eq("prev_owner", id);
  await db.from("free_claims").delete().eq("user_id", id);
  await db.from("flip_bank").delete().eq("user_id", id);
  await db.from("player_stats").delete().eq("user_id", id);
  const { error } = await db.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
