import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { ownedItems } from "@/lib/store";

export const dynamic = "force-dynamic";

// GET — what you own and which skin you're using (the catalog itself ships in
// the page from src/lib/commander/skins.ts).
export async function GET() {
  const { data: u } = await (await createClient()).auth.getUser();
  const user = u.user && !u.user.is_anonymous ? u.user : null;
  if (!user) return NextResponse.json({ signedIn: false, owned: [], skin: null, custom: null, side: null, shuffle: false, pool: [] });
  const db = createAdminClient();
  const [owned, { data: prof }, { data: claim }] = await Promise.all([
    ownedItems(user.id),
    db.from("commander_profile").select("skin,custom_colors,shuffle,skin_pool").eq("user_id", user.id).maybeSingle(),
    db.from("free_claims").select("side").eq("user_id", user.id).maybeSingle(),
  ]);
  return NextResponse.json({ signedIn: true, owned, skin: prof?.skin ?? null, custom: prof?.custom_colors ?? null, side: claim?.side ?? null, shuffle: !!prof?.shuffle, pool: prof?.skin_pool ?? [] });
}
