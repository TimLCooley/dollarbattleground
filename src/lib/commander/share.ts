import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import { moveRows, type Layout, type Placement } from "./engine";
import { skinColors } from "./skins";

// A shared path, for the short link (/s/<id>) and its preview image: the
// sharer's whole board (Tim, 2026-10-21: "I actually want to see the board").
export async function sharedPath(id: string) {
  if (!/^[A-Za-z0-9_-]{4,20}$/.test(id)) return null;
  const db = createAdminClient();
  const { data: share } = await db.from("commander_shares").select("day,user_id").eq("id", id).maybeSingle();
  if (!share) return null;
  const [{ data: day }, { data: score }, { data: claim }, { data: prof }] = await Promise.all([
    db.from("commander_days").select("layout").eq("day", share.day).maybeSingle(),
    db.from("commander_scores").select("placements,medal").eq("day", share.day).eq("user_id", share.user_id).maybeSingle(),
    db.from("free_claims").select("side").eq("user_id", share.user_id).maybeSingle(),
    db.from("commander_profile").select("skin,custom_colors").eq("user_id", share.user_id).maybeSingle(),
  ]);
  if (!day || !score) return null;
  return {
    day: share.day as number,
    side: (claim?.side === "red" ? "red" : "blue") as "red" | "blue",
    // the sharer's store skin, so the picture looks like their board
    colors: skinColors(prof?.skin, prof?.custom_colors, claim?.side === "red" ? "red" : "blue"),
    medal: (score.medal ?? null) as string | null,
    rows: moveRows(day.layout as Layout, score.placements as Placement[]),
    layout: day.layout as Layout,
    placements: score.placements as Placement[],
  };
}
