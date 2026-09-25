import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { DEFAULT_GOAL, draftPost, publishPost } from "@/lib/autopilot";
import type { Faction } from "@/lib/x";

// Per-faction Social queue API (admin-only). Red drafts → @RedBattleGround,
// Blue → @BluBattleGround. Deny-only: drafts land 'queued' with a scheduled_for
// (the review window); deny (with reason → learn + replace in the same slot) or
// publish now. Drafting/publishing live in lib/autopilot so the cron tick and
// this UI share one code path. GET ?faction=red|blue for one team's queue.

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = createAdminClient();
  const faction = new URL(req.url).searchParams.get("faction");
  let q = db.from("agent_posts").select("*").order("created_at", { ascending: false }).limit(50);
  if (faction === "red" || faction === "blue" || faction === "founder") q = q.eq("faction", faction);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = createAdminClient();
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    faction?: Faction;
    goal?: string;
    id?: number;
    reason?: string;
    auto?: boolean;
  };
  const faction: Faction = body.faction === "blue" ? "blue" : "red";

  try {
    if (body.action === "draft") {
      // The ⚡ button always drafts; the page's auto-draft only fills an empty column.
      const post = await draftPost(db, faction, body.goal?.trim() || DEFAULT_GOAL, { force: !body.auto });
      return NextResponse.json({ post });
    }

    if (body.action === "deny") {
      if (!body.id || !body.reason?.trim())
        return NextResponse.json({ error: "id + reason required" }, { status: 400 });
      // No automatic replacement: the queue refills itself (page auto-draft +
      // the tick), so a denial just removes the post and trains the agents.
      await db
        .from("agent_posts")
        .update({ status: "denied", deny_reason: body.reason.trim(), decided_at: new Date().toISOString() })
        .eq("id", body.id);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "publish") {
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const r = await publishPost(db, body.id);
      return NextResponse.json({ ok: true, id: r.id, video: r.video });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
