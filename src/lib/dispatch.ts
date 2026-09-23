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

const SITE = "https://dollarbattleground.com";
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
        <h1 style="margin:0 0 14px;font-size:18px;letter-spacing:1px;color:#f2c14e">$ DOLLAR BATTLEGROUND</h1>
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
           <p style="margin:0 0 6px;font-size:14px;color:#efe4c4">${nudge || `A dollar takes it back. The map stands Red ${board.red} · Blue ${board.blue}.`}</p>
           ${cta(url, many ? "TAKE THEM BACK →" : "TAKE IT BACK →", side)}`,
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
    const subject = (lost ?? 0) > 0 ? `${NAME[enemy]} took ${lost} of your tiles while you were gone` : `The line moved while you were gone`;
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
           <p style="margin:0 0 10px;font-size:14px;color:#efe4c4">${days} day${days === 1 ? "" : "s"} away. You hold <b>${held ?? 0}</b> tile${held === 1 ? "" : "s"}${(lost ?? 0) > 0 ? ` — and ${NAME[enemy]} took <b>${lost}</b> from you` : ""}. Board: Red ${board.red} · Blue ${board.blue}.</p>
           ${line ? `<p style="margin:0 0 6px;font-size:15px">“${line}”</p>` : ""}
           <p style="margin:0 0 6px;font-size:14px;color:#efe4c4">${nudge || "One flip puts you back in it."}</p>
           ${cta(url, "BACK TO THE BOARD →", side)}`,
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
          `You're getting this because you joined the waitlist at dollarbattleground.com. This is the only nudge we'll send.`,
        ),
    });
    if (id) sent++;
  }
  return sent;
}

// ── Commander notifications ─────────────────────────────────────────────────
// One digest per tick listing what happened since the last one: signups,
// purchases, takeovers, dispatches that went out, posts that published.
// Batched by design — a hot hour is one email, not forty.

const NOTIFY_KINDS = ["player_new", "waitlist_new", "purchase", "takeover", "email_takeover", "email_reminder", "email_waitlist", "post_published"];
const KIND_LABEL: Record<string, string> = {
  player_new: "signup",
  waitlist_new: "waitlist signup",
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
