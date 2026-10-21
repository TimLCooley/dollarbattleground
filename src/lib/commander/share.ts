import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import { moveRows, type Layout, type Placement } from "./engine";

// A shared path, for the short link (/s/<id>) and its preview image. Only the
// move rows (which troop, how many squares) — never where they stood.
export async function sharedPath(id: string) {
  if (!/^[A-Za-z0-9_-]{4,20}$/.test(id)) return null;
  const db = createAdminClient();
  const { data: share } = await db.from("commander_shares").select("day,user_id").eq("id", id).maybeSingle();
  if (!share) return null;
  const [{ data: day }, { data: score }, { data: claim }] = await Promise.all([
    db.from("commander_days").select("layout").eq("day", share.day).maybeSingle(),
    db.from("commander_scores").select("placements,medal").eq("day", share.day).eq("user_id", share.user_id).maybeSingle(),
    db.from("free_claims").select("side").eq("user_id", share.user_id).maybeSingle(),
  ]);
  if (!day || !score) return null;
  return {
    day: share.day as number,
    side: (claim?.side === "red" ? "red" : "blue") as "red" | "blue",
    medal: (score.medal ?? null) as string | null,
    rows: moveRows(day.layout as Layout, score.placements as Placement[]),
  };
}
