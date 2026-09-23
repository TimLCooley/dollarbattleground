import "server-only";
import type { Db } from "@/lib/app-config";
import { themeOf } from "@/lib/recruiter";

// Intel Ops' brief: the one set of real numbers every agent works from — the
// board, the funnel, and how posts are performing. Built fresh on demand
// (cheap: a handful of small queries) and rendered both as data (for the UI)
// and as prose (for prompts). Nothing here is invented; if a number is zero,
// the agents are told it's zero.

export interface IntelBrief {
  at: string;
  campaign: { goal: number; perTeam: number; redRecruits: number; blueRecruits: number; daysLeft: number } | null;
  board: {
    red: number;
    blue: number;
    redPct: number;
    bluePct: number;
    flips24h: number;
    toRed24h: number;
    toBlue24h: number;
    hot: { x: number; y: number; flips: number }[];
    hotRegions: { region: string; flips: number }[];
  };
  funnel: {
    waitlistTotal: number;
    waitlist24h: number;
    waitlist7d: number;
    players: number;
    active24h: number;
    paidFlips7d: number;
    spentTotalCents: number;
    emails7d: number;
    emailClicks7d: number;
    signups24h: number;
    signups7d: number;
    purchases24h: number;
    purchases7d: number;
    revenue7dCents: number;
    takeoverEmails7d: number;
    winbacks7d: number; // takeover alerts after which the player came back and acted within 48h
  };
  social: {
    posted: number;
    queued: number;
    byAngle: { key: string; n: number; imp: number; eng: number; clk: number }[];
    top: { faction: string | null; angle: string | null; copy: string; clicks: number; impressions: number }[];
  };
  text: string;
}

const H = 60 * 60_000;

// The house voice is territory + compass directions, never coordinates. Every
// cell maps to a region so the brief (and everything downstream) can say
// "the northeast" instead of "5,3".
export function regionName(x: number, y: number): string {
  const ns = y <= 4 ? "north" : y >= 10 ? "south" : "";
  const ew = x <= 4 ? "west" : x >= 10 ? "east" : "";
  if (!ns && !ew) return "the center";
  return "the " + (ns && ew ? ns + ew : ns || ew);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;
async function count(db: Db, table: string, mod?: (q: AnyQuery) => AnyQuery): Promise<number> {
  let q: AnyQuery = db.from(table).select("id", { count: "exact", head: true });
  if (mod) q = mod(q);
  const { count: n } = await q;
  return n ?? 0;
}

export async function intelBrief(db: Db): Promise<IntelBrief> {
  const now = Date.now();
  const since24 = new Date(now - 24 * H).toISOString();
  const since7d = new Date(now - 7 * 24 * H).toISOString();

  // ── board ──
  const { data: tiles } = await db.from("tiles").select("team");
  let red = 0;
  let blue = 0;
  for (const t of (tiles ?? []) as { team: string | null }[]) {
    if (t.team === "red") red++;
    else if (t.team === "blue") blue++;
  }
  const total = red + blue || 1;
  const redPct = Math.round((red / total) * 100);

  const { data: ev } = await db
    .from("tile_events")
    .select("x,y,team,source,created_at")
    .gte("created_at", since7d)
    .order("created_at", { ascending: false })
    .limit(5000);
  const events = (ev ?? []) as { x: number; y: number; team: string; source: string | null; created_at: string }[];
  let flips24h = 0;
  let toRed24h = 0;
  let toBlue24h = 0;
  let paidFlips7d = 0;
  const perCell = new Map<string, number>();
  for (const e of events) {
    if (e.source === "paid") paidFlips7d++;
    perCell.set(`${e.x},${e.y}`, (perCell.get(`${e.x},${e.y}`) ?? 0) + 1);
    if (e.created_at >= since24) {
      flips24h++;
      if (e.team === "red") toRed24h++;
      else if (e.team === "blue") toBlue24h++;
    }
  }
  const hot = [...perCell.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, flips]) => {
      const [x, y] = k.split(",").map(Number);
      return { x, y, flips };
    });
  const perRegion = new Map<string, number>();
  for (const [k, n] of perCell) {
    const [x, y] = k.split(",").map(Number);
    perRegion.set(regionName(x, y), (perRegion.get(regionName(x, y)) ?? 0) + n);
  }
  const hotRegions = [...perRegion.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([region, flips]) => ({ region, flips }));

  // ── funnel ──
  const gte = (col: string, v: string) => (q: AnyQuery) => q.gte(col, v);
  const [waitlistTotal, waitlist24h, waitlist7d] = await Promise.all([
    count(db, "waitlist"),
    count(db, "waitlist", gte("created_at", since24)),
    count(db, "waitlist", gte("created_at", since7d)),
  ]);
  const { data: em } = await db.from("email_log").select("clicks").is("error", null).gte("sent_at", since7d).limit(2000);
  const emailRows = (em ?? []) as { clicks: number }[];
  const emails7d = emailRows.length;
  const emailClicks7d = emailRows.reduce((s, r) => s + (r.clicks ?? 0), 0);

  // The activity ledger: signups + purchases, and whether takeover alerts work.
  const { data: act } = await db.from("activity").select("kind,created_at,meta").gte("created_at", since7d).limit(5000);
  let signups24h = 0;
  let signups7d = 0;
  let purchases24h = 0;
  let purchases7d = 0;
  let revenue7dCents = 0;
  for (const a of (act ?? []) as { kind: string; created_at: string; meta: { cents?: number } | null }[]) {
    const today = a.created_at >= since24;
    if (a.kind === "player_new") {
      signups7d++;
      if (today) signups24h++;
    } else if (a.kind === "purchase") {
      purchases7d++;
      revenue7dCents += a.meta?.cents ?? 0;
      if (today) purchases24h++;
    }
  }
  const { data: tk } = await db
    .from("email_log")
    .select("user_id,sent_at")
    .eq("kind", "takeover")
    .is("error", null)
    .gte("sent_at", since7d)
    .limit(1000);
  const takeoverEmails = (tk ?? []) as { user_id: string | null; sent_at: string }[];
  const takeoverEmails7d = takeoverEmails.length;
  let winbacks7d = 0;
  if (takeoverEmails7d > 0) {
    const ids = [...new Set(takeoverEmails.map((t) => t.user_id).filter(Boolean))] as string[];
    const { data: acted } = await db.from("player_stats").select("user_id,last_action_at").in("user_id", ids);
    const lastAct = new Map((acted ?? []).map((p) => [(p as { user_id: string }).user_id, (p as { last_action_at: string | null }).last_action_at]));
    for (const t of takeoverEmails) {
      const la = t.user_id ? lastAct.get(t.user_id) : null;
      if (la && la > t.sent_at && new Date(la).getTime() - new Date(t.sent_at).getTime() <= 48 * H) winbacks7d++;
    }
  }
  const { data: ps } = await db.from("player_stats").select("spent_cents,last_action_at");
  const stats = (ps ?? []) as { spent_cents: number | null; last_action_at: string | null }[];
  const players = stats.length;
  let active24h = 0;
  let spentTotalCents = 0;
  for (const s of stats) {
    spentTotalCents += s.spent_cents ?? 0;
    if (s.last_action_at && s.last_action_at >= since24) active24h++;
  }

  // ── social ──
  const { data: postedRows } = await db
    .from("agent_posts")
    .select("faction,angle,reason,impressions,likes,reposts,replies,clicks,copy")
    .eq("status", "posted")
    .order("posted_at", { ascending: false })
    .limit(200);
  const posted = (postedRows ?? []) as {
    faction: string | null;
    angle: string | null;
    reason: string | null;
    impressions: number | null;
    likes: number | null;
    reposts: number | null;
    replies: number | null;
    clicks: number | null;
    copy: string;
  }[];
  const queued = await count(db, "agent_posts", (q) => q.eq("status", "queued"));
  const agg = new Map<string, { n: number; imp: number; eng: number; clk: number }>();
  for (const p of posted) {
    // Every post is an experiment — score by team, angle, and the lead theme it tested.
    const theme = themeOf(p.reason);
    for (const k of [`team:${p.faction ?? "?"}`, `angle:${p.angle ?? "?"}`, ...(theme ? [`theme:${theme}`] : [])]) {
      const a = agg.get(k) ?? { n: 0, imp: 0, eng: 0, clk: 0 };
      a.n++;
      a.imp += p.impressions ?? 0;
      a.eng += (p.likes ?? 0) + (p.reposts ?? 0) + (p.replies ?? 0);
      a.clk += p.clicks ?? 0;
      agg.set(k, a);
    }
  }
  const byAngle = [...agg.entries()].map(([key, a]) => ({ key, ...a }));
  const top = [...posted]
    .sort((x, y) => (y.clicks ?? 0) - (x.clicks ?? 0) || (y.impressions ?? 0) - (x.impressions ?? 0))
    .slice(0, 3)
    .map((p) => ({ faction: p.faction, angle: p.angle, copy: p.copy, clicks: p.clicks ?? 0, impressions: p.impressions ?? 0 }));

  // Campaign goal: 1,000 recruits in 15 days, 500 per side. Progress = new
  // players per side since the campaign started.
  const campRow = await db.from("app_config").select("value").eq("key", "campaign").maybeSingle();
  let campaign: IntelBrief["campaign"] = null;
  try {
    const camp = JSON.parse((campRow.data as { value?: string } | null)?.value ?? "null") as { started_at?: string; ends_at?: string } | null;
    if (camp?.started_at && camp.ends_at) {
      const { data: rec } = await db.from("activity").select("faction").eq("kind", "player_new").gte("created_at", camp.started_at).limit(5000);
      let redRecruits = 0;
      let blueRecruits = 0;
      for (const r of (rec ?? []) as { faction: string | null }[]) {
        if (r.faction === "red") redRecruits++;
        else if (r.faction === "blue") blueRecruits++;
      }
      campaign = {
        goal: 1000,
        perTeam: 500,
        redRecruits,
        blueRecruits,
        daysLeft: Math.max(0, Math.ceil((new Date(camp.ends_at).getTime() - now) / 86_400_000)),
      };
    }
  } catch {
    /* no campaign yet */
  }

  const brief: IntelBrief = {
    campaign,
    at: new Date(now).toISOString(),
    board: { red, blue, redPct, bluePct: 100 - redPct, flips24h, toRed24h, toBlue24h, hot, hotRegions },
    funnel: {
      waitlistTotal,
      waitlist24h,
      waitlist7d,
      players,
      active24h,
      paidFlips7d,
      spentTotalCents,
      emails7d,
      emailClicks7d,
      signups24h,
      signups7d,
      purchases24h,
      purchases7d,
      revenue7dCents,
      takeoverEmails7d,
      winbacks7d,
    },
    social: { posted: posted.length, queued, byAngle, top },
    text: "",
  };
  brief.text = renderBrief(brief);
  return brief;
}

function renderBrief(b: IntelBrief): string {
  const { board, funnel, social } = b;
  const diff = board.red - board.blue;
  const lead = diff === 0 ? "DEAD EVEN" : `${diff > 0 ? "RED" : "BLUE"} LEADS by ${Math.abs(diff)} tile${Math.abs(diff) === 1 ? "" : "s"}`;
  const lines = [
    b.campaign
      ? `CAMPAIGN GOAL: ${b.campaign.goal.toLocaleString()} recruits in 15 days — ${b.campaign.perTeam} per side. ${b.campaign.daysLeft} days left. So far: Red ${b.campaign.redRecruits}, Blue ${b.campaign.blueRecruits}. Needed per day from here: ~${Math.ceil(Math.max(0, b.campaign.goal - b.campaign.redRecruits - b.campaign.blueRecruits) / Math.max(1, b.campaign.daysLeft))}.`
      : "CAMPAIGN: not started.",
    `MAP: RED holds ${board.red} positions (${board.redPct}%) vs BLUE ${board.blue} (${board.bluePct}%) — ${lead}.` +
      ` Last 24h: ${board.flips24h} moves (${board.toRed24h} taken by Red, ${board.toBlue24h} by Blue).` +
      (board.hotRegions.length
        ? ` Most contested ground this week: ${board.hotRegions.map((h) => `${h.region} (${h.flips} moves)`).join(", ")}.`
        : " No contested ground this week yet.") +
      ` (House voice: say positions/ground/fronts and compass directions — never coordinates, never "flip".)`,
    `FUNNEL: waitlist ${funnel.waitlistTotal} total (+${funnel.waitlist24h} today, +${funnel.waitlist7d} this week). Players ${funnel.players} (${funnel.active24h} active today). Paid flips this week: ${funnel.paidFlips7d}. Total spent by players: $${(funnel.spentTotalCents / 100).toFixed(2)}.`,
    `SIGNUPS: +${funnel.signups24h} today, +${funnel.signups7d} this week. PURCHASES: ${funnel.purchases24h} today, ${funnel.purchases7d} this week ($${(funnel.revenue7dCents / 100).toFixed(2)}).`,
    `EMAIL: ${funnel.emails7d} dispatches this week, ${funnel.emailClicks7d} clicked. Takeover alerts: ${funnel.takeoverEmails7d} sent, ${funnel.winbacks7d} brought the player back within 48h` +
      (funnel.takeoverEmails7d ? ` (${Math.round((100 * funnel.winbacks7d) / funnel.takeoverEmails7d)}% win-back rate).` : "."),
    social.posted === 0
      ? `SOCIAL: nothing has been posted yet (${social.queued} queued). No performance data — this is day zero.`
      : `SOCIAL: ${social.posted} posted, ${social.queued} queued. ` +
        social.byAngle.map((a) => `${a.key}: ${a.n} posts, ${a.imp} imp, ${a.eng} eng, ${a.clk} clicks`).join("; ") +
        (social.top.length ? ` Top by clicks: ${social.top.map((t) => `[${t.clicks}] ${t.faction}/${t.angle} "${t.copy.slice(0, 80)}"`).join(" | ")}` : ""),
  ];
  return lines.join("\n");
}
