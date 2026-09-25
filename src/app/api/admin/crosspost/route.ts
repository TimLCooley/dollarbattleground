import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { crosspostToTikTok, getCrosspost, isRobinReachConfigured, setCrosspost } from "@/lib/robinreach";

// The TikTok cross-post switch, plus a by-hand "send this clip" for a posted card.

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const cfg = await getCrosspost(createAdminClient());
  return NextResponse.json({ ...cfg, configured: isRobinReachConfigured() });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = createAdminClient();
  const body = (await req.json().catch(() => ({}))) as { action?: string; tiktok?: boolean; id?: number };
  if (body.action === "set") {
    const cfg = await setCrosspost(db, { tiktok: Boolean(body.tiktok) });
    return NextResponse.json({ ...cfg, configured: isRobinReachConfigured() });
  }
  if (body.action === "send" && body.id) {
    const { data } = await db.from("agent_posts").select("id,faction,x_account,copy,media_url,status").eq("id", body.id).single();
    const p = data as { id: number; faction: string | null; x_account: string | null; copy: string; media_url: string | null; status: string } | null;
    if (!p?.media_url) return NextResponse.json({ error: "that card has no clip" }, { status: 400 });
    const faction = p.faction === "blue" || p.x_account === "blue" ? "blue" : "red";
    return NextResponse.json(await crosspostToTikTok(db, { id: p.id, faction, copy: p.copy, media_url: p.media_url }));
  }
  return NextResponse.json({ error: "action?" }, { status: 400 });
}
