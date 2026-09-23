import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";

// A signed-in player's own dispatch preferences (the server-side truth the
// email sweep honours). GET reads them; POST sets them. Anonymous sessions
// have no inbox, so they get 401.

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email || user.is_anonymous) return null;
  return user;
}

export async function GET() {
  const user = await me();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const db = createAdminClient();
  await db.from("email_prefs").upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });
  const { data } = await db.from("email_prefs").select("takeover_alerts,reminders").eq("user_id", user.id).single();
  return NextResponse.json(data ?? { takeover_alerts: true, reminders: true });
}

export async function POST(req: Request) {
  const user = await me();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { takeover_alerts?: boolean; reminders?: boolean };
  const patch: Record<string, boolean | string> = { updated_at: new Date().toISOString() };
  if (typeof body.takeover_alerts === "boolean") patch.takeover_alerts = body.takeover_alerts;
  if (typeof body.reminders === "boolean") patch.reminders = body.reminders;
  const db = createAdminClient();
  await db.from("email_prefs").upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });
  const { data } = await db.from("email_prefs").select("takeover_alerts,reminders").eq("user_id", user.id).single();
  return NextResponse.json(data ?? {});
}
