import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { sendEmail } from "@/lib/email";

// Players for the USERS tab: everyone who took a position or joined the
// waitlist — side, founder #, joined, last active, tiles held, and the power-
// ups in their bank. POST grants power-ups or emails one player.

export interface PlayerRow {
  id: string | null; // auth user id (null = waitlist only)
  email: string;
  side: string | null;
  founder: number | null; // Founding Officer #N
  joined: string | null;
  lastActive: string | null;
  held: number;
  strikes: number; // 3×3
  blocks: number; // 2×2
  singles: number; // 1×1
  lastDaily: string | null;
  waitlistOnly: boolean;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = createAdminClient();
  const users: User[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) break;
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  const byId = new Map(users.map((u) => [u.id, u]));
  const [{ data: claims }, { data: bank }, { data: tiles }, { data: stats }, { data: wl }] = await Promise.all([
    db.from("free_claims").select("user_id,side,founding_officer,created_at").order("created_at", { ascending: true }),
    db.from("flip_bank").select("user_id,singles,blocks,strikes,last_daily_on"),
    db.from("tiles").select("owner_id").not("owner_id", "is", null),
    db.from("player_stats").select("user_id,last_action_at"),
    db.from("waitlist").select("email,side,created_at"),
  ]);
  const held = new Map<string, number>();
  for (const t of (tiles ?? []) as { owner_id: string }[]) held.set(t.owner_id, (held.get(t.owner_id) ?? 0) + 1);
  const bankBy = new Map(((bank ?? []) as { user_id: string; singles: number; blocks: number; strikes: number; last_daily_on: string | null }[]).map((b) => [b.user_id, b]));
  const lastBy = new Map(((stats ?? []) as { user_id: string; last_action_at: string | null }[]).map((s) => [s.user_id, s.last_action_at]));
  let n = 0;
  const rows: PlayerRow[] = [];
  const seen = new Set<string>();
  for (const c of (claims ?? []) as { user_id: string; side: string | null; founding_officer: boolean; created_at: string }[]) {
    const u = byId.get(c.user_id);
    const email = u?.email ?? "(no email)";
    seen.add(email.toLowerCase());
    const b = bankBy.get(c.user_id);
    const times = [u?.last_sign_in_at, lastBy.get(c.user_id), b?.last_daily_on].filter(Boolean) as string[];
    rows.push({
      id: c.user_id,
      email,
      side: c.side,
      founder: c.founding_officer ? ++n : null,
      joined: c.created_at,
      lastActive: times.sort().at(-1) ?? null,
      held: held.get(c.user_id) ?? 0,
      strikes: b?.strikes ?? 0,
      blocks: b?.blocks ?? 0,
      singles: b?.singles ?? 0,
      lastDaily: b?.last_daily_on ?? null,
      waitlistOnly: false,
    });
  }
  for (const w of (wl ?? []) as { email: string; side: string | null; created_at: string }[]) {
    if (seen.has(w.email.toLowerCase())) continue;
    rows.push({ id: null, email: w.email, side: w.side, founder: null, joined: w.created_at, lastActive: null, held: 0, strikes: 0, blocks: 0, singles: 0, lastDaily: null, waitlistOnly: true });
  }
  return NextResponse.json({ players: rows });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = createAdminClient();
  const body = (await req.json().catch(() => ({}))) as {
    action?: string; id?: string; email?: string; strikes?: number; blocks?: number; singles?: number; subject?: string; message?: string;
  };
  if (body.action === "grant") {
    if (!body.id) return NextResponse.json({ error: "this player hasn't taken a position yet" }, { status: 400 });
    const { error } = await db.rpc("credit_bank", {
      p_owner: body.id,
      p_singles: Math.max(0, Math.floor(body.singles ?? 0)),
      p_blocks: Math.max(0, Math.floor(body.blocks ?? 0)),
      p_strikes: Math.max(0, Math.floor(body.strikes ?? 0)),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "message") {
    const email = (body.email ?? "").trim();
    const subject = (body.subject ?? "").trim();
    const message = (body.message ?? "").trim();
    if (!email || !subject || !message) return NextResponse.json({ error: "email, subject and message are required" }, { status: 400 });
    const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const paras = message.split(/\n{2,}/).map((p) => `<p style="margin:0 0 10px;font-size:15px;color:#efe4c4">${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
    const html = `<div style="font-family:system-ui,Arial,sans-serif;background:#124f2b;padding:24px;color:#f6efdb"><div style="max-width:480px;margin:0 auto;background:#155f33;border:3px solid #0c3c21;padding:24px"><h1 style="margin:0 0 14px;font-size:18px;letter-spacing:1px;color:#f2c14e">$ DOLLAR BATTLEGROUND</h1>${paras}<a href="https://dollarbattleground.com" style="display:inline-block;margin:14px 0 4px;padding:12px 18px;background:#d23b3b;color:#fff;text-decoration:none;font-weight:700;border:3px solid #0c3c21">TO THE BOARD →</a></div></div>`;
    const r = await sendEmail({ to: email, subject, html });
    await db.from("email_log").insert({ user_id: body.id ?? null, email, kind: "admin_message", subject, meta: { message }, error: r.ok ? null : r.error ?? "send failed" });
    if (!r.ok) return NextResponse.json({ error: r.error ?? "send failed" }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "action?" }, { status: 400 });
}
