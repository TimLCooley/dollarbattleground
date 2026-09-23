import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendWaitlistWelcome } from "@/lib/dispatch";

// Public waitlist capture — the pre-launch landing (coming-soon) page collects
// email + side here so traffic from X becomes leads. De-duped on email; a
// brand-new signup gets the welcome email with the countdown.

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    side?: string;
    source?: string;
  };
  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }
  const side = body.side === "red" || body.side === "blue" ? body.side : null;
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("waitlist")
      .upsert({ email, side, source: body.source ?? null }, { onConflict: "email", ignoreDuplicates: true })
      .select("email");
    if (error) throw new Error(error.message);
    // ON CONFLICT DO NOTHING returns no row for a repeat — only first-timers get the welcome.
    if ((data ?? []).length > 0) await sendWaitlistWelcome(db, email, side).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
