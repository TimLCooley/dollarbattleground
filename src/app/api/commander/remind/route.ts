import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

// POST {email?} — remind me when tomorrow's Commander is live (signed-in players
// can skip the email). GET ?unsub=<token> — stop the reminders.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const { data: u } = await (await createClient()).auth.getUser();
  const user = u.user && !u.user.is_anonymous ? u.user : null;
  const email = (body.email ?? user?.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const db = createAdminClient();
  const { error } = await db
    .from("commander_reminders")
    .upsert({ email, user_id: user?.id ?? null, active: true }, { onConflict: "email" });
  if (error) return NextResponse.json({ error: "Couldn't save that — try again." }, { status: 500 });
  return NextResponse.json({ ok: true, email });
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("unsub");
  if (token && /^[0-9a-f-]{36}$/i.test(token)) {
    await createAdminClient().from("commander_reminders").update({ active: false }).eq("token", token);
  }
  return NextResponse.redirect(new URL("/?unsubscribed=1", req.url));
}
