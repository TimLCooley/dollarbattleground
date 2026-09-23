import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { refreshMetrics } from "@/lib/autopilot";

// The posting calendar's data: everything that's been posted, with live X
// metrics. GET lists them; POST {action:'refresh'} pulls fresh metrics from X
// (the autopilot tick does the same hourly).

const COLS =
  "id,copy,faction,x_account,angle,format,external_id,posted_at,impressions,likes,reposts,replies,quotes,clicks,metrics_at";

async function list(db: ReturnType<typeof createAdminClient>) {
  return db.from("agent_posts").select(COLS).eq("status", "posted").order("posted_at", { ascending: false }).limit(300);
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { data, error } = await list(createAdminClient());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = createAdminClient();
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action !== "refresh") return NextResponse.json({ error: "unknown action" }, { status: 400 });
  const updated = await refreshMetrics(db);
  const { data: fresh } = await list(db);
  return NextResponse.json({ posts: fresh, updated });
}
