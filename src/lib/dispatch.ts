import "server-only";
import { cfgGet, cfgSet, type Db } from "@/lib/app-config";
import { sendEmail, isEmailConfigured } from "@/lib/email";
import { generateBriefing, isBrainConfigured } from "@/lib/agent-brain";
import { SUPER_ADMIN_EMAIL } from "@/lib/admin-shared";
import { regionName } from "@/lib/intel";

// Dispatches: the email side of the funnel. Two kinds —
//  • TAKEOVER alerts: the tiles trigger logs every enemy takeover of an owned
//    tile; we email the displaced owner "Blue took your square — get it back",
//    batched per owner (a 3×3 strike is one email) and capped at one per hour
//    (a hot fight becomes a digest on the next sweep).
//  • REMINDERS: players who've gone quiet get "the line moved while you were
//    gone" — at most every 3 days, at most 3 times until they act. Waitlist
//    signups who never claimed get one nudge.
// Every email carries an unsubscribe link and goes out through /e/<id> so
// clicks are measured (email → visits, for the Intel brief). The Sergeant
// (Gemini) adds one in-character line when available; templates never wait on it.

const SITE = "https://commanderbg.com";
const TAKEOVER_COOLDOWN_MS = 60 * 60_000;
const REMINDER_AFTER_MS = 3 * 24 * 60 * 60_000;
const REMINDER_GAP_MS = 3 * 24 * 60 * 60_000;
const REMINDER_MAX = 3;
const REMINDER_SWEEP_MS = 6 * 60 * 60_000;
const WAITLIST_AFTER_MS = 24 * 60 * 60_000;

type Side = "red" | "blue";
const NAME: Record<Side, string> = { red: "Red", blue: "Blue" };
const COLOR: Record<Side, string> = { red: "#d23b3b", blue: "#356fd0" };
const SERGEANT_PERSONALITY =
  "The Sergeant: gruff, funny drill-sergeant energy, fiercely loyal to the player's side, talks in short punchy lines. It's a game — never cruel, never real politics.";

export interface DispatchConfig {
  takeovers: boolean;
  reminders: boolean;
  waitlist: boolean;
  notify_commander: boolean; // digest email to the admin each tick when there's new activity
}
const DEFAULTS: DispatchConfig = { takeovers: true, reminders: true, waitlist: true, notify_commander: true };

export async function getDispatchConfig(db: Db): Promise<DispatchConfig> {
  return { ...DEFAULTS, ...((await cfgGet<Partial<DispatchConfig>>(db, "dispatch")) ?? {}) };
}

// ── shared helpers ──────────────────────────────────────────────────────────

interface Prefs {
  user_id: string;
  takeover_alerts: boolean;
  reminders: boolean;
  unsub_token: string;
}

async function prefsFor(db: Db, userId: string): Promise<Prefs> {
  await db.from("email_prefs").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  const { data } = await db.from("email_prefs").select("*").eq("user_id", userId).single();
  return data as Prefs;
}

async function emailsFor(db: Db, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data } = await db.rpc("emails_for_users", { p_ids: ids });
  for (const r of (data ?? []) as { user_id: string; email: string }[]) out.set(r.user_id, r.email);
  return out;
}

// The recruiting countdown, for every dispatch's footer.
async function countdownLine(db: Db): Promise<string> {
  const camp = await cfgGet<{ ends_at?: string }>(db, "campaign");
  if (!camp?.ends_at) return "";
  const days = Math.max(0, Math.ceil((new Date(camp.ends_at).getTime() - Date.now()) / 86_400_000));
  if (days <= 0) return "";
  return `<p style="margin:12px 0 0;font-size:12px;color:#f2c14e;letter-spacing:1px">⏳ ${days} day${days === 1 ? "" : "s"} left to join the founding class</p>`;
}

async function boardNow(db: Db): Promise<{ red: number; blue: number }> {
  const { data } = await db.from("tiles").select("team");
  let red = 0;
  let blue = 0;
  for (const t of (data ?? []) as { team: string | null }[]) {
    if (t.team === "red") red++;
    else if (t.team === "blue") blue++;
  }
  return { red, blue };
}

// Log first so the CTA can route through /e/<id>; then send; then record errors.
async function logAndSend(
  db: Db,
  p: { userId: string | null; email: string; kind: string; subject: string; target: string; meta?: Record<string, unknown>; html: (ctaUrl: string) => string },
): Promise<number | null> {
  const { data: row } = await db
    .from("email_log")
    .insert({ user_id: p.userId, email: p.email, kind: p.kind, subject: p.subject, meta: { target: p.target, ...(p.meta ?? {}) } })
    .select("id")
    .single();
  const id = (row as { id: number } | null)?.id;
  if (!id) return null;
  const res = await sendEmail({ to: p.email, subject: p.subject, html: p.html(`${SITE}/e/${id}`) });
  if (!res.ok) await db.from("email_log").update({ error: res.error ?? "send failed" }).eq("id", id);
  return res.ok ? id : null;
}

function wrap(inner: string, footer: string): string {
  return `
    <div style="font-family:system-ui,Arial,sans-serif;background:#124f2b;padding:24px;color:#f6efdb">
      <div style="max-width:480px;margin:0 auto;background:#155f33;border:3px solid #0c3c21;padding:24px">
        <h1 style="margin:0 0 14px;font-size:18px;letter-spacing:1px;color:#f2c14e">COMMANDERBG</h1>
        ${inner}
        <p style="margin:18px 0 0;font-size:11px;color:#efe4c4;opacity:.7">${footer}</p>
      </div>
    </div>`;
}

function unsubFooter(token: string, kind: "takeover" | "reminders"): string {
  const one = kind === "takeover" ? "takeover alerts" : "reminders";
  return `<a style="color:#efe4c4" href="${SITE}/email/unsubscribe?t=${token}&kind=${kind}">Stand down from ${one}</a> · <a style="color:#efe4c4" href="${SITE}/email/unsubscribe?t=${token}&kind=all">all dispatches</a>`;
}

function cta(url: string, label: string, side: Side): string {
  return `<a href="${url}" style="display:inline-block;margin:14px 0 4px;padding:12px 18px;background:${COLOR[side]};color:#fff;text-decoration:none;font-weight:700;letter-spacing:.5px;border:3px solid #0c3c21">${label}</a>`;
}

// ── takeover alerts ─────────────────────────────────────────────────────────

interface TakeoverRow {
  id: number;
  x: number;
  y: number;
  prev_owner: string;
  prev_team: string | null;
  new_team: string;
  created_at: string;
}

export async function sendPendingTakeovers(db: Db): Promise<number> {
  if (!isEmailConfigured()) return 0;
  const cfg = await getDispatchConfig(db);
  if (!cfg.takeovers) return 0;

  const { data } = await db
    .from("tile_takeovers")
    .select("id,x,y,prev_owner,prev_team,new_team,created_at")
    .is("emailed_at", null)
    .order("created_at", { ascending: true })
    .limit(500);
  const rows = (data ?? []) as TakeoverRow[];
  if (rows.length === 0) return 0;

  const byOwner = new Map<string, TakeoverRow[]>();
  for (const r of rows) byOwner.set(r.prev_owner, [...(byOwner.get(r.prev_owner) ?? []), r]);
  const emails = await emailsFor(db, [...byOwner.keys()]);
  const board = await boardNow(db);
  const countdown = await countdownLine(db);
  let sent = 0;

  for (const [owner, lost] of byOwner) {
    const email = emails.get(owner);
    if (!email) {
      // anonymous owner — nothing to email; don't keep re-scanning it
      await db.from("tile_takeovers").update({ emailed_at: new Date().toISOString() }).in("id", lost.map((r) => r.id));
      continue;
    }
    const prefs = await prefsFor(db, owner);
    if (!prefs.takeover_alerts) {
      await db.from("tile_takeovers").update({ emailed_at: new Date().toISOString() }).in("id", lost.map((r) => r.id));
      continue;
    }
    // one alert per hour per player; the rest waits for the next sweep as a digest
    const { data: last } = await db
      .from("email_log")
      .select("sent_at")
      .eq("user_id", owner)
      .eq("kind", "takeover")
      .is("error", null)
      .order("sent_at", { ascending: false })
      .limit(1);
    const lastAt = (last?.[0] as { sent_at: string } | undefined)?.sent_at;
    if (lastAt && Date.now() - new Date(lastAt).getTime() < TAKEOVER_COOLDOWN_MS) continue;

    const side = ((lost[0].prev_team === "blue" ? "blue" : "red") as Side);
    const enemy: Side = side === "red" ? "blue" : "red";
    const uniq = [...new Map(lost.map((r) => [`${r.x},${r.y}`, r])).values()];
    const first = uniq[0];
    const many = uniq.length > 1;
    // House voice: territory + directions, never coordinates.
    const regions = [...new Set(uniq.map((r) => regionName(r.x, r.y)))];
    const where = regions.length === 1 ? regions[0] : regions.slice(0, -1).join(", ") + " and " + regions[regions.length - 1];
    const subject = many
      ? `${NAME[enemy]} took ${uniq.length} of your positions in ${where} — get them back`
      : `${NAME[enemy]} took your position in ${where} — get it back`;

    // The Sergeant's line (optional, never blocks the alert).
    let line = "";
    let nudge = "";
    if (isBrainConfigured()) {
      const { count: held } = await db.from("tiles").select("x", { count: "exact", head: true }).eq("owner_id", owner);
      const b = await generateBriefing("The Sergeant", SERGEANT_PERSONALITY, {
        side,
        held: held ?? 0,
        actions: 0,
        captures: 0,
        red: board.red,
        blue: board.blue,
        enemyRecent: uniq.length,
        lastTakenCell: { x: first.x, y: first.y },
      }).catch(() => null);
      if (b) {
        line = b.line;
        nudge = b.nudge;
      }
    }

    const target = `${SITE}/${side}?tile=${first.x},${first.y}`;
    const id = await logAndSend(db, {
      userId: owner,
      email,
      kind: "takeover",
      subject,
      target,
      meta: { tiles: uniq.map((r) => ({ x: r.x, y: r.y })), enemy },
      html: (url) =>
        wrap(
          `<p style="margin:0 0 10px;font-size:17px;font-weight:700;color:${COLOR[enemy]}">${NAME[enemy]} just took ${many ? `${uniq.length} of your positions in ${where}` : `your position in ${where}`}.</p>
           ${line ? `<p style="margin:0 0 6px;font-size:15px">“${line}”</p>` : ""}
           <p style="margin:0 0 6px;font-size:14px;color:#efe4c4">${nudge || `One move takes it back. The map stands Red ${board.red} · Blue ${board.blue}.`}</p>
           ${cta(url, many ? "TAKE THEM BACK →" : "TAKE IT BACK →", side)}${countdown}`,
          unsubFooter(prefs.unsub_token, "takeover"),
        ),
    });
    if (id) {
      sent++;
      await db.from("tile_takeovers").update({ emailed_at: new Date().toISOString(), email_id: id }).in("id", lost.map((r) => r.id));
    }
  }
  return sent;
}

// ── reminders ───────────────────────────────────────────────────────────────

export async function sendReminders(db: Db): Promise<number> {
  if (!isEmailConfigured()) return 0;
  const cfg = await getDispatchConfig(db);
  if (!cfg.reminders) return 0;
  const cutoff = new Date(Date.now() - REMINDER_AFTER_MS).toISOString();
  const { data } = await db
    .from("player_stats")
    .select("user_id,side,last_action_at,captures")
    .lt("last_action_at", cutoff)
    .not("side", "is", null)
    .order("last_action_at", { ascending: true })
    .limit(50);
  const dormant = (data ?? []) as { user_id: string; side: Side; last_action_at: string; captures: number }[];
  if (dormant.length === 0) return 0;
  const emails = await emailsFor(db, dormant.map((d) => d.user_id));
  const board = await boardNow(db);
  const countdown = await countdownLine(db);
  let sent = 0;

  for (const d of dormant) {
    const email = emails.get(d.user_id);
    if (!email) continue;
    const prefs = await prefsFor(db, d.user_id);
    if (!prefs.reminders) continue;
    const { data: prior } = await db
      .from("email_log")
      .select("sent_at")
      .eq("user_id", d.user_id)
      .eq("kind", "reminder")
      .is("error", null)
      .gt("sent_at", d.last_action_at)
      .order("sent_at", { ascending: false });
    const sinceAction = (prior ?? []) as { sent_at: string }[];
    if (sinceAction.length >= REMINDER_MAX) continue;
    if (sinceAction[0] && Date.now() - new Date(sinceAction[0].sent_at).getTime() < REMINDER_GAP_MS) continue;

    const [{ count: held }, { count: lost }] = await Promise.all([
      db.from("tiles").select("x", { count: "exact", head: true }).eq("owner_id", d.user_id),
      db.from("tile_takeovers").select("id", { count: "exact", head: true }).eq("prev_owner", d.user_id).gt("created_at", d.last_action_at),
    ]);
    const side = d.side;
    const enemy: Side = side === "red" ? "blue" : "red";
    let line = "";
    let nudge = "";
    if (isBrainConfigured()) {
      const b = await generateBriefing("The Sergeant", SERGEANT_PERSONALITY, {
        side,
        held: held ?? 0,
        actions: 0,
        captures: d.captures ?? 0,
        red: board.red,
        blue: board.blue,
        enemyRecent: lost ?? 0,
        lastTakenCell: null,
      }).catch(() => null);
      if (b) {
        line = b.line;
        nudge = b.nudge;
      }
    }
    const days = Math.max(1, Math.round((Date.now() - new Date(d.last_action_at).getTime()) / 86_400_000));
    const subject = (lost ?? 0) > 0 ? `${NAME[enemy]} took ${lost} of your positions while you were gone` : `The line moved while you were gone`;
    const id = await logAndSend(db, {
      userId: d.user_id,
      email,
      kind: "reminder",
      subject,
      target: `${SITE}/${side}`,
      meta: { days, held: held ?? 0, lost: lost ?? 0 },
      html: (url) =>
        wrap(
          `<p style="margin:0 0 10px;font-size:17px;font-weight:700;color:${COLOR[side]}">${NAME[side]} needs you back on the line.</p>
           <p style="margin:0 0 10px;font-size:14px;color:#efe4c4">${days} day${days === 1 ? "" : "s"} away. You hold <b>${held ?? 0}</b> position${held === 1 ? "" : "s"}${(lost ?? 0) > 0 ? ` — and ${NAME[enemy]} took <b>${lost}</b> from you` : ""}. The map stands Red ${board.red} · Blue ${board.blue}.</p>
           ${line ? `<p style="margin:0 0 6px;font-size:15px">“${line}”</p>` : ""}
           <p style="margin:0 0 6px;font-size:14px;color:#efe4c4">${nudge || "One position puts you back in it."}</p>
           ${cta(url, "BACK TO THE BOARD →", side)}${countdown}`,
          unsubFooter(prefs.unsub_token, "reminders"),
        ),
    });
    if (id) sent++;
  }
  return sent;
}

// Waitlist signups who never claimed a tile: one nudge, once.
export async function sendWaitlistNudges(db: Db): Promise<number> {
  if (!isEmailConfigured()) return 0;
  const cfg = await getDispatchConfig(db);
  if (!cfg.waitlist) return 0;
  const cutoff = new Date(Date.now() - WAITLIST_AFTER_MS).toISOString();
  const { data } = await db.from("waitlist").select("email,side").lt("created_at", cutoff).limit(100);
  const rows = (data ?? []) as { email: string; side: string | null }[];
  if (rows.length === 0) return 0;
  const emails = rows.map((r) => r.email);
  const [{ data: existing }, { data: already }] = await Promise.all([
    db.rpc("users_exist_for_emails", { p_emails: emails }),
    db.from("email_log").select("email").eq("kind", "waitlist").in("email", emails),
  ]);
  const skip = new Set<string>([
    ...((existing ?? []) as string[]),
    ...((already ?? []) as { email: string }[]).map((r) => r.email),
  ]);
  let sent = 0;
  for (const r of rows) {
    if (skip.has(r.email)) continue;
    const side: Side = r.side === "blue" ? "blue" : "red";
    const id = await logAndSend(db, {
      userId: null,
      email: r.email,
      kind: "waitlist",
      subject: `${NAME[side]} is holding a tile for you`,
      target: `${SITE}/${side}`,
      html: (url) =>
        wrap(
          `<p style="margin:0 0 10px;font-size:17px;font-weight:700;color:${COLOR[side]}">You picked ${NAME[side]}. The board is live.</p>
           <p style="margin:0 0 6px;font-size:14px;color:#efe4c4">Your first tile is free — claim it and you're on the line.</p>
           ${cta(url, "CLAIM YOUR FREE TILE →", side)}`,
          `You're getting this because you joined the waitlist at commanderbg.com. This is the only nudge we'll send.`,
        ),
    });
    if (id) sent++;
  }
  return sent;
}

// Waitlist welcome: sent the moment someone enlists on the Coming Soon wall.
// Carries the countdown so the "15… 14…" they saw on screen lands in their inbox.
export async function sendWaitlistWelcome(db: Db, email: string, side: Side | null): Promise<number | null> {
  if (!isEmailConfigured()) return null;
  const s: Side = side ?? "red";
  const camp = await cfgGet<{ ends_at?: string }>(db, "campaign");
  const days = camp?.ends_at ? Math.max(0, Math.ceil((new Date(camp.ends_at).getTime() - Date.now()) / 86_400_000)) : 0;
  const who = side ? `${NAME[side]} soldier` : "soldier";
  const subject = days > 0 ? `You're on the list — ${days} day${days === 1 ? "" : "s"} left to enlist` : `You're on the list`;
  return logAndSend(db, {
    userId: null,
    email,
    kind: "waitlist_welcome",
    subject,
    target: `${SITE}/${s}`,
    meta: { days, side },
    html: (url) =>
      wrap(
        `<p style="margin:0 0 10px;font-size:17px;font-weight:700;color:${COLOR[s]}">You're on the list, ${who}.</p>
         ${days > 0 ? `<p style="margin:0 0 10px;font-size:14px;color:#efe4c4">Enlistment closes in <b>${days}</b> day${days === 1 ? "" : "s"}. When the gates open you get first call — pick your position before the other side does.</p>` : ""}
         <p style="margin:0 0 6px;font-size:14px;color:#efe4c4">Until then, bring a friend. The side with more boots holds more ground.</p>
         ${cta(url, "SHARE THE FRONT →", s)}`,
        `You're getting this because you enlisted at commanderbg.com. You'll get one signal when mobilization begins.`,
      ),
  });
}

// The launch signal: the gates are open. One email per waitlist address,
// red to Red, blue to Blue, never twice (email_log kind "launch" is the ledger).
// Sent in batches by the tick; ~2/s keeps Resend's rate limit happy.
export async function sendLaunchEmails(db: Db, limit: number): Promise<{ sent: number; remaining: number }> {
  if (!isEmailConfigured()) return { sent: 0, remaining: 0 };
  const [{ data: list }, { data: logged }] = await Promise.all([
    db.from("waitlist").select("email,side").order("created_at", { ascending: true }).limit(5000),
    db.from("email_log").select("email").eq("kind", "launch").limit(10000),
  ]);
  const done = new Set(((logged ?? []) as { email: string }[]).map((r) => r.email.toLowerCase()));
  const pending = ((list ?? []) as { email: string; side: string | null }[]).filter((r) => !done.has(r.email.toLowerCase()));
  const batch = pending.slice(0, limit);
  let sent = 0;
  for (const r of batch) {
    const side: Side | null = r.side === "red" || r.side === "blue" ? r.side : null;
    const s: Side = side ?? "red";
    const enemy = NAME[s === "red" ? "blue" : "red"];
    const id = await logAndSend(db, {
      userId: null,
      email: r.email,
      kind: "launch",
      subject: side ? `${NAME[side]}: the gates are open — take your position` : `The gates are open — pick your side`,
      target: side ? `${SITE}/${side}` : SITE,
      meta: { side },
      html: (url) =>
        wrap(
          `<p style="margin:0 0 10px;font-size:17px;font-weight:700;color:${COLOR[s]}">${side ? `Mobilization has begun, ${NAME[side]} soldier.` : "Mobilization has begun."}</p>
           <p style="margin:0 0 10px;font-size:14px;color:#efe4c4">The map is live. Your first position is free — ${side ? `take it before ${enemy} does` : "pick your side and take it"}. Officers commission from the field.</p>
           <p style="margin:0 0 6px;font-size:14px;color:#efe4c4">The founding class is whoever shows up first. That's you, if you move.</p>
           ${cta(url, side ? "TAKE YOUR POSITION →" : "PICK YOUR SIDE →", s)}`,
          `You asked us to signal you when the gates opened at commanderbg.com. This is that signal.`,
        ),
    });
    if (id) sent++;
    await new Promise((r) => setTimeout(r, 550));
  }
  return { sent, remaining: pending.length - batch.length };
}

// ── One-off broadcasts from the General ─────────────────────────────────────
// app_config.broadcast = {id, send: true} → once, to every waitlist address and
// every player: founders hear their supplies are on the board; everyone else
// hears what's waiting when they take their first position. email_log kind
// `broadcast:<id>` is the ledger, so nobody gets it twice.
export async function sendBroadcast(db: Db): Promise<number> {
  if (!isEmailConfigured()) return 0;
  const cfg = await cfgGet<{ id?: string; send?: boolean; done?: boolean }>(db, "broadcast");
  if (!cfg?.send || cfg.done || !cfg.id) return 0;
  const kind = `broadcast:${cfg.id}`;
  const [{ data: wl }, { data: fc }, { data: logged }] = await Promise.all([
    db.from("waitlist").select("email,side"),
    db.from("free_claims").select("user_id,side,founding_officer"),
    db.from("email_log").select("email").eq("kind", kind),
  ]);
  const claims = (fc ?? []) as { user_id: string; side: string | null; founding_officer: boolean }[];
  const emails = await emailsFor(db, claims.map((c) => c.user_id));
  const people = new Map<string, { side: Side | null; founder: boolean; userId: string | null }>();
  for (const w of (wl ?? []) as { email: string; side: string | null }[]) {
    people.set(w.email.toLowerCase(), { side: w.side === "red" || w.side === "blue" ? w.side : null, founder: false, userId: null });
  }
  for (const c of claims) {
    const e = emails.get(c.user_id);
    if (!e) continue;
    people.set(e.toLowerCase(), { side: c.side === "red" || c.side === "blue" ? c.side : null, founder: !!c.founding_officer, userId: c.user_id });
  }
  const done = new Set(((logged ?? []) as { email: string }[]).map((r) => r.email.toLowerCase()));
  let sent = 0;
  for (const [email, p] of people) {
    if (done.has(email)) continue;
    const s: Side = p.side ?? "red";
    const S = p.side ? NAME[p.side] : null;
    const subject = p.founder ? "Orders from the General: supplies issued, Officer" : "Orders from the General: supplies are waiting for you";
    const id = await logAndSend(db, {
      userId: p.userId,
      email,
      kind,
      subject,
      target: p.side ? `${SITE}/${p.side}` : SITE,
      html: (url) =>
        wrap(
          p.founder
            ? `<p style="margin:0 0 10px;font-size:16px;font-weight:700;color:${COLOR[s]}">Officer — the General has issued your battle supplies.</p>
               <p style="margin:0 0 10px;font-size:14px;color:#efe4c4">As one of the first hundred, you're a Founding Officer. Waiting on the board for you right now:</p>
               <p style="margin:0 0 10px;font-size:15px;color:#fff"><b>1 × 3×3 barrage</b><br><b>1 × 2×2 strike</b><br><b>1 × single square</b></p>
               <p style="margin:0 0 10px;font-size:14px;color:#efe4c4">They're free. Open the board and they're armed — pick your spot and fire. And report in tomorrow: every day you come back, there's another square waiting.</p>
               ${cta(url, "DEPLOY YOUR SUPPLIES →", s)}
               <p style="margin:14px 0 0;font-size:13px;color:#efe4c4">— The General</p>`
            : `<p style="margin:0 0 10px;font-size:16px;font-weight:700;color:${COLOR[s]}">Recruit — the gates are open, and the General is holding supplies for you.</p>
               <p style="margin:0 0 10px;font-size:14px;color:#efe4c4">The map is live. Take your first position${S ? ` for ${S}` : ""} and you're issued, free:</p>
               <p style="margin:0 0 10px;font-size:15px;color:#fff"><b>1 × 2×2 strike</b><br><b>1 × single square</b><br>and while spots last, a <b>3×3 barrage</b> and a Founding Officer commission — the first hundred only.</p>
               <p style="margin:0 0 10px;font-size:14px;color:#efe4c4">Report in daily and there's a free square waiting each time.</p>
               ${cta(url, "CLAIM YOUR SUPPLIES →", s)}
               <p style="margin:14px 0 0;font-size:13px;color:#efe4c4">— The General</p>`,
          "You're getting this because you signed up at commanderbg.com.",
        ),
    });
    if (id) sent++;
  }
  await cfgSet(db, "broadcast", { ...cfg, done: true, sent, sent_at: new Date().toISOString() });
  return sent;
}

// ── Supplies arrived ────────────────────────────────────────────────────────
// Tell a player new attacks are on the board for them: the morning's daily
// supplies, or pieces the admin granted. Respects the reminders opt-out.
export async function notifySupplies(
  db: Db,
  p: { userId: string; side: string | null; pieces: { strikes?: number; blocks?: number; singles?: number }; reason: "daily" | "gift" },
): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  const prefs = await prefsFor(db, p.userId);
  if (prefs && (prefs as { reminders?: boolean }).reminders === false) return false;
  const email = (await emailsFor(db, [p.userId])).get(p.userId);
  if (!email) return false;
  const s: Side = p.side === "blue" ? "blue" : "red";
  const list = [
    p.pieces.strikes ? `<b>${p.pieces.strikes} × 3×3 barrage</b>` : "",
    p.pieces.blocks ? `<b>${p.pieces.blocks} × 2×2 strike</b>` : "",
    p.pieces.singles ? `<b>${p.pieces.singles} × single square</b>` : "",
  ].filter(Boolean).join("<br>");
  const subject = p.reason === "daily" ? "Your daily supplies are on the board" : "The General sent you new attacks";
  const id = await logAndSend(db, {
    userId: p.userId,
    email,
    kind: p.reason === "daily" ? "supplies_daily" : "supplies_gift",
    subject,
    target: `${SITE}/${s}`,
    meta: { pieces: p.pieces },
    html: (url) =>
      wrap(
        `<p style="margin:0 0 10px;font-size:16px;font-weight:700;color:${COLOR[s]}">${p.reason === "daily" ? "Reporting for duty — today's supplies are in." : "New attacks issued to you."}</p>
         <p style="margin:0 0 10px;font-size:15px;color:#fff">${list}</p>
         <p style="margin:0 0 6px;font-size:14px;color:#efe4c4">They're free and already on your board. Pick your spot and fire${p.reason === "daily" ? " — another round arrives tomorrow" : ""}.</p>
         ${cta(url, "DEPLOY THEM →", s)}`,
        prefs ? unsubFooter((prefs as { unsub_token: string }).unsub_token, "reminders") : "",
      ),
  });
  return !!id;
}

// Each morning (MT), issue everyone's daily supplies and email them.
export async function dailySupplies(db: Db): Promise<number> {
  const { data, error } = await db.rpc("issue_daily_supplies");
  if (error) throw new Error(error.message);
  let sent = 0;
  for (const r of (data ?? []) as { user_id: string; side: string | null; officer: boolean; add_singles: number; add_blocks: number }[]) {
    if (!r.add_singles && !r.add_blocks) continue; // still had today's kit — nothing new to announce
    try {
      if (await notifySupplies(db, { userId: r.user_id, side: r.side, pieces: { blocks: r.add_blocks, singles: r.add_singles }, reason: "daily" })) sent++;
    } catch {
      /* next */
    }
  }
  return sent;
}

// ── Daily scoreboard ────────────────────────────────────────────────────────
// Once a day (Tim, 2026-10-25): "are new people playing?" — yesterday and the
// last 7 days in Mountain time: new visitors (a browser's first visit), how
// many of them actually placed a troop, attacked, signed up, who came back,
// purchases; where visitors came from; clip views; feedback.
export async function dailyScoreboard(db: Db): Promise<boolean> {
  if (!isEmailConfigured()) return false;
  const mt = (d: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(new Date(d));
  const today = mt(new Date());
  const days = Array.from({ length: 7 }, (_, k) => mt(new Date(Date.now() - (7 - k) * 86_400_000))); // the 7 days before today
  const yesterday = days[6];
  const since = new Date(Date.now() - 9 * 86_400_000).toISOString();
  const [{ data: fe }, { data: scores }, { data: users }, { data: buys }, { data: posts }, { data: fb }] = await Promise.all([
    db.from("funnel_events").select("step,session_id,meta,created_at").in("step", ["commander_open", "commander_play", "commander_submit", "commander_share"]).gte("created_at", since),
    db.from("commander_scores").select("user_id,created_at"),
    db.rpc("admin_real_users"),
    db.from("store_entitlements").select("amount_cents,created_at").gt("amount_cents", 0).gte("created_at", since),
    db.from("agent_posts").select("posted_at,social").eq("status", "posted").gte("posted_at", since),
    db.from("feedback").select("email,message").gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString()).order("created_at", { ascending: false }).limit(10),
  ]);
  const F = (fe ?? []) as { step: string; session_id: string; meta: { ref?: string } | null; created_at: string }[];
  const stepOn = (step: string, day: string) => new Set(F.filter((e) => e.step === step && mt(e.created_at) === day).map((e) => e.session_id)).size;
  const S = ((scores ?? []) as { user_id: string; created_at: string }[]).sort((x, y) => x.created_at.localeCompare(y.created_at));
  const firstScore = new Map<string, string>();
  for (const r of S) if (!firstScore.has(r.user_id)) firstScore.set(r.user_id, mt(r.created_at));
  const returning = (day: string) => new Set(S.filter((r) => mt(r.created_at) === day && firstScore.get(r.user_id)! < day).map((r) => r.user_id)).size;
  const U = (users ?? []) as { created_at: string; email: string | null }[];
  const signups = (day: string) => U.filter((u) => u.email && mt(u.created_at) === day).length;
  const B = (buys ?? []) as { amount_cents: number; created_at: string }[];
  const sales = (day: string) => B.filter((x) => mt(x.created_at) === day);
  const row = (day: string) => ({
    day,
    visitors: stepOn("commander_open", day),
    played: stepOn("commander_play", day),
    attacked: stepOn("commander_submit", day),
    signups: signups(day),
    returning: returning(day),
    sales: sales(day).length,
    revenue: sales(day).reduce((n, x) => n + x.amount_cents, 0),
  });
  const rows = days.map(row);
  const y = rows[6];
  // where yesterday's new visitors came from
  const refs = new Map<string, number>();
  for (const e of F) if (e.step === "commander_open" && mt(e.created_at) === yesterday) {
    const r = (e.meta?.ref ?? "direct").replace(/^www\./, "") || "direct";
    refs.set(r, (refs.get(r) ?? 0) + 1);
  }
  const refLine = [...refs.entries()].sort((p, q) => q[1] - p[1]).map(([r, n]) => `${r} ${n}`).join(" · ");
  // clip views (what each platform shows now) for clips posted yesterday
  type Social = Record<string, { views?: number }>;
  const P = ((posts ?? []) as { posted_at: string; social: Social | null }[]).filter((p) => mt(p.posted_at) === yesterday);
  const views = (pf: string) => P.reduce((n, p) => n + Number(p.social?.[pf]?.views ?? 0), 0);
  const fbHtml = ((fb ?? []) as { email: string | null; message: string }[]).map((x) => `<p style="margin:0 0 8px;font-size:13px;color:#efe4c4">“${x.message.replace(/</g, "&lt;")}”${x.email ? ` — ${x.email}` : ""}</p>`).join("");
  const big = (n: number | string, label: string) => `<td style="padding:6px 14px 6px 0;vertical-align:top"><div style="font-size:30px;font-weight:800;color:#fff;line-height:1">${n}</div><div style="font-size:12px;color:#efe4c4;margin-top:4px">${label}</div></td>`;
  const short = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" });
  const th = (t: string) => `<td style="padding:3px 8px;color:#f2c14e;font-size:12px">${t}</td>`;
  const td = (v: number | string, hi = false) => `<td style="padding:3px 8px;text-align:right;color:${hi ? "#fff" : "#efe4c4"}">${hi ? `<b>${v}</b>` : v}</td>`;
  const table = `<table style="font-size:14px;border-collapse:collapse"><tr>${th("")}${th("new visitors")}${th("played")}${th("attacked")}${th("signed up")}${th("came back")}${th("sales")}</tr>${rows
    .map((r) => `<tr><td style="padding:3px 8px 3px 0;color:#efe4c4">${short(r.day)}</td>${td(r.visitors, true)}${td(r.played, true)}${td(r.attacked)}${td(r.signups)}${td(r.returning)}${td(r.sales ? `${r.sales} · $${(r.revenue / 100).toFixed(0)}` : 0)}</tr>`)
    .join("")}</table>`;
  const verdict =
    y.visitors === 0 ? "No new visitors yesterday." : y.played === 0 ? `${y.visitors} new visitor${y.visitors === 1 ? "" : "s"} came — none placed a troop.` : `${y.played} of ${y.visitors} new visitors placed a troop.`;
  const html = wrap(
    `<p style="margin:0 0 4px;font-size:17px;font-weight:700;color:#f2c14e">Are new people playing?</p>
     <p style="margin:0 0 10px;font-size:15px;color:#fff">${verdict}</p>
     <table style="border-collapse:collapse"><tr>${big(y.visitors, "new visitors")}${big(y.played, "played")}${big(y.attacked, "attacked")}${big(y.signups, "signed up")}${big(y.returning, "came back")}</tr></table>
     ${refLine ? `<p style="margin:6px 0 0;font-size:13px;color:#efe4c4">New visitors came from: ${refLine}</p>` : ""}
     <p style="margin:16px 0 6px;font-size:13px;color:#f2c14e;letter-spacing:1px">LAST 7 DAYS</p>
     ${table}
     <p style="margin:16px 0 4px;font-size:13px;color:#f2c14e;letter-spacing:1px">YESTERDAY'S CLIPS (${P.length})</p>
     <p style="margin:0;font-size:14px;color:#efe4c4">TikTok <b>${views("tiktok")}</b> · Instagram <b>${views("instagram")}</b> · YouTube <b>${views("youtube")}</b> views so far</p>
     ${fbHtml ? `<p style="margin:16px 0 4px;font-size:13px;color:#f2c14e;letter-spacing:1px">FEEDBACK</p>${fbHtml}` : ""}`,
    `"New visitors" = a browser's first visit to CommanderBG. "Played" = their first troop placed (guests count). "Attacked" needs an account. Days are Mountain time. Today so far (${today}): ${row(today).visitors} new visitors, ${row(today).played} played.`,
  );
  const res = await sendEmail({ to: SUPER_ADMIN_EMAIL, subject: `CommanderBG yesterday: ${y.visitors} new visitors · ${y.played} played · ${y.signups} signed up`, html });
  return res.ok;
}

// ── Commander notifications ─────────────────────────────────────────────────
// One digest per tick listing what happened since the last one: signups,
// purchases, takeovers, dispatches that went out, posts that published.
// Batched by design — a hot hour is one email, not forty.

const NOTIFY_KINDS = ["feedback", "player_new", "waitlist_new", "purchase", "takeover", "email_takeover", "email_reminder", "email_waitlist", "email_waitlist_welcome", "email_launch", "post_published"];
const KIND_LABEL: Record<string, string> = {
  feedback: "💬 FEEDBACK",
  player_new: "signup",
  waitlist_new: "waitlist signup",
  email_waitlist_welcome: "welcome sent",
  email_launch: "launch signal sent",
  purchase: "purchase",
  takeover: "takeover",
  email_takeover: "takeover alert sent",
  email_reminder: "reminder sent",
  email_waitlist: "waitlist nudge sent",
  post_published: "post published",
};

export async function notifyCommander(db: Db): Promise<number> {
  if (!isEmailConfigured()) return 0;
  const cfg = await getDispatchConfig(db);
  if (!cfg.notify_commander) return 0;
  const { data } = await db
    .from("activity")
    .select("id,kind,faction,summary,created_at")
    .is("notified_at", null)
    .in("kind", NOTIFY_KINDS)
    .order("created_at", { ascending: true })
    .limit(100);
  const rows = (data ?? []) as { id: number; kind: string; faction: string | null; summary: string; created_at: string }[];
  if (rows.length === 0) return 0;

  const tally = new Map<string, number>();
  for (const r of rows) tally.set(r.kind, (tally.get(r.kind) ?? 0) + 1);
  const parts = [...tally.entries()].map(([k, n]) => `${n} ${KIND_LABEL[k] ?? k}${n === 1 ? "" : "s"}`);
  const subject = `🔔 Battleground: ${parts.join(", ")}`;
  const lines = rows
    .map((r) => {
      const t = new Date(r.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
      const dot = r.faction === "red" ? "🔴" : r.faction === "blue" ? "🔵" : "▪️";
      return `<li style="margin:0 0 6px">${dot} <span style="opacity:.7">${t}</span> ${r.summary}</li>`;
    })
    .join("");
  const res = await sendEmail({
    to: SUPER_ADMIN_EMAIL,
    subject,
    html: wrap(
      `<p style="margin:0 0 10px;font-size:15px;font-weight:700">Since the last dispatch:</p>
       <ul style="margin:0 0 12px;padding-left:18px;font-size:14px;color:#efe4c4">${lines}</ul>
       <a href="${SITE}/admin/activity" style="color:#f2c14e">Open the activity feed →</a>`,
      `Commander digest — turn off with app_config.dispatch.notify_commander.`,
    ),
  });
  if (!res.ok) return 0;
  // Mark everything up to the newest row as notified (non-digest kinds too, so the pending index stays small).
  const maxId = rows[rows.length - 1].id;
  await db.from("activity").update({ notified_at: new Date().toISOString() }).is("notified_at", null).lte("id", maxId);
  return rows.length;
}

// The sweep the cron tick runs: takeovers every tick, reminders every 6h,
// then the Commander's digest of whatever happened.
export async function runDispatches(db: Db): Promise<{ takeovers: number; reminders: number; waitlist: number; notified: number }> {
  const out = { takeovers: 0, reminders: 0, waitlist: 0, notified: 0 };
  out.takeovers = await sendPendingTakeovers(db);
  const state = (await cfgGet<{ last_reminders_at?: string }>(db, "dispatch_state")) ?? {};
  if (!state.last_reminders_at || Date.now() - new Date(state.last_reminders_at).getTime() > REMINDER_SWEEP_MS) {
    out.reminders = await sendReminders(db);
    out.waitlist = await sendWaitlistNudges(db);
    await cfgSet(db, "dispatch_state", { ...state, last_reminders_at: new Date().toISOString() });
  }
  try {
    out.notified = await notifyCommander(db);
  } catch (e) {
    console.error("commander digest failed:", e instanceof Error ? e.message : e);
  }
  return out;
}

export async function unsubscribe(db: Db, token: string, kind: string): Promise<boolean> {
  const patch =
    kind === "takeover" ? { takeover_alerts: false } : kind === "reminders" ? { reminders: false } : { takeover_alerts: false, reminders: false };
  const { data } = await db
    .from("email_prefs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("unsub_token", token)
    .select("user_id");
  return (data?.length ?? 0) > 0;
}
