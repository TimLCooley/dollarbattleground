import "server-only";
import type { Db } from "@/lib/app-config";

// Intel Ops' brief: the one set of real numbers every agent works from — the
// board, the funnel, and how posts are performing. Built fresh on demand
// (cheap: a handful of small queries) and rendered both as data (for the UI)
// and as prose (for prompts). Nothing here is invented; if a number is zero,
// the agents are told it's zero.

export interface IntelBrief {
  at: string;
  board: {
    red: number;
    blue: number;
    redPct: number;
    bluePct: number;
    flips24h: number;
    toRed24h: number;
    toBlue24h: number;
    hot: { x: number; y: number; flips: number }[];
  };
  funnel: {
    waitlistTotal: number;
    waitlist24h: number;
    waitlist7d: number;
    players: number;
    active24h: number;
    paidFlips7d: number;
    spentTotalCents: number;
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

  // ── funnel ──
  const gte = (col: string, v: string) => (q: AnyQuery) => q.gte(col, v);
  const [waitlistTotal, waitlist24h, waitlist7d] = await Promise.all([
    count(db, "waitlist"),
    count(db, "waitlist", gte("created_at", since24)),
    count(db, "waitlist", gte("created_at", since7d)),
  ]);
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
    .select("faction,angle,impressions,likes,reposts,replies,clicks,copy")
    .eq("status", "posted")
    .order("posted_at", { ascending: false })
    .limit(200);
  const posted = (postedRows ?? []) as {
    faction: string | null;
    angle: string | null;
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
    for (const k of [`team:${p.faction ?? "?"}`, `angle:${p.angle ?? "?"}`]) {
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

  const brief: IntelBrief = {
    at: new Date(now).toISOString(),
    board: { red, blue, redPct, bluePct: 100 - redPct, flips24h, toRed24h, toBlue24h, hot },
    funnel: { waitlistTotal, waitlist24h, waitlist7d, players, active24h, paidFlips7d, spentTotalCents },
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
    `BOARD: RED ${board.red} tiles (${board.redPct}%) vs BLUE ${board.blue} (${board.bluePct}%) on a 15×15 grid — ${lead}.` +
      ` Last 24h: ${board.flips24h} flips (${board.toRed24h} to Red, ${board.toBlue24h} to Blue).` +
      (board.hot.length ? ` Hottest cells this week: ${board.hot.map((h) => `${h.x},${h.y} (${h.flips} flips)`).join(", ")}.` : " No contested cells this week yet."),
    `FUNNEL: waitlist ${funnel.waitlistTotal} total (+${funnel.waitlist24h} today, +${funnel.waitlist7d} this week). Players ${funnel.players} (${funnel.active24h} active today). Paid flips this week: ${funnel.paidFlips7d}. Total spent by players: $${(funnel.spentTotalCents / 100).toFixed(2)}.`,
    social.posted === 0
      ? `SOCIAL: nothing has been posted yet (${social.queued} queued). No performance data — this is day zero.`
      : `SOCIAL: ${social.posted} posted, ${social.queued} queued. ` +
        social.byAngle.map((a) => `${a.key}: ${a.n} posts, ${a.imp} imp, ${a.eng} eng, ${a.clk} clicks`).join("; ") +
        (social.top.length ? ` Top by clicks: ${social.top.map((t) => `[${t.clicks}] ${t.faction}/${t.angle} "${t.copy.slice(0, 80)}"`).join(" | ")}` : ""),
  ];
  return lines.join("\n");
}
