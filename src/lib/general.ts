import "server-only";
import { cfgGet, cfgSet, type Db } from "@/lib/app-config";
import { claudeChat } from "@/lib/claude";
import { agentByKey } from "@/lib/agents";
import type { IntelBrief } from "@/lib/intel";

// The General's standing orders: the strategy layer between the Commander's
// goal and the Social agents' posts. The General writes them from the Intel
// brief (daily, or on demand); the Commander can override the recruiting mix
// with the slider — that override sticks until unlocked.

export interface GeneralOrders {
  recruit_pct: number; // share of posts that are recruiting CTAs (with the link)
  directives: string[]; // standing orders both Social agents must follow
  red_focus: string;
  blue_focus: string;
  rationale: string;
  updated_at: string;
  by: "general" | "commander" | "default";
  pct_locked_by_commander: boolean;
}

const KEY = "general_orders";

export const DEFAULT_ORDERS: GeneralOrders = {
  recruit_pct: 60,
  directives: [
    "Use real numbers from the Intel brief in most posts — specific tiles, flips, and counts beat adjectives.",
    "Recruiting posts give ONE concrete reason to join right now and speak to one person.",
    "Non-recruiting posts (updates, hype, taunts) carry no link — they build the account.",
    "Sound like a person running the account, never like a brand campaign.",
  ],
  red_focus: "",
  blue_focus: "",
  rationale: "Default orders until the General plans from live data.",
  updated_at: new Date(0).toISOString(),
  by: "default",
  pct_locked_by_commander: false,
};

export async function getOrders(db: Db): Promise<GeneralOrders> {
  const saved = await cfgGet<Partial<GeneralOrders>>(db, KEY);
  return { ...DEFAULT_ORDERS, ...(saved ?? {}) };
}

// Commander edits (slider, directives). Touching recruit_pct locks it.
export async function setOrders(db: Db, patch: Partial<GeneralOrders>): Promise<GeneralOrders> {
  const cur = await getOrders(db);
  const next: GeneralOrders = {
    ...cur,
    ...patch,
    recruit_pct: clampPct(patch.recruit_pct ?? cur.recruit_pct),
    pct_locked_by_commander: patch.recruit_pct != null ? true : (patch.pct_locked_by_commander ?? cur.pct_locked_by_commander),
    updated_at: new Date().toISOString(),
    by: "commander",
  };
  await cfgSet(db, KEY, next);
  return next;
}

// The General reads the brief and writes fresh orders (Claude).
// The Commander's standing notes: free-form feedback that goes into every
// prompt (General, Social agents, chat) and outranks the orders.
export async function getCommanderNotes(db: Db): Promise<string> {
  return (await cfgGet<{ text?: string }>(db, "commander_notes"))?.text ?? "";
}
export async function setCommanderNotes(db: Db, text: string): Promise<string> {
  const t = text.trim().slice(0, 4000);
  await cfgSet(db, "commander_notes", { text: t, updated_at: new Date().toISOString() });
  return t;
}

export async function planOrders(
  db: Db,
  brief: IntelBrief,
  goal: string,
  daysLeft: number | null,
  feedback: { commanderNotes?: string; denyReasons?: string[] } = {},
): Promise<GeneralOrders> {
  const cur = await getOrders(db);
  const persona = agentByKey("general")?.persona ?? "You are THE GENERAL.";
  const system = `${persona}

You are writing STANDING ORDERS for the two Social agents (Red Social runs @RedBattleGround, Blue Social runs @BluBattleGround). They will follow these orders on every post until you change them. Be specific and practical; you're a commander, not a consultant.

What a RECRUITING post is: an invitation to someone who has never heard of the game — what it is (a live map, Red vs Blue fighting for territory, first position free, a dollar takes a position), why pick this side, how to start. It is NOT a score report. Board numbers are seasoning, never the opening line. Orders like "state the score first" produce sports tickers, not recruits.

Recruiting themes the Social agents have (all real — don't invent other perks): SELECTIVE ("we're looking for the best; earn your rank"), the real CAMPAIGN COUNTDOWN (days left to join the founding class of your side), the OFFICER PATH (a $5 strike commissions you as a Second Lieutenant — join as an officer, not a private), and the FREE first position. Your orders should say which themes to lead with this period.

House voice, non-negotiable: territory language and compass directions ("pushing in from the south", "the eastern front"). Never grid coordinates (no "5,3", no "H8") and never "flip tiles". Don't write directives that name cells.

Fixed system policy you cannot override: recruiting posts carry the dollarbattleground.com link; updates, hype, and taunts never do (that's what makes the feed read as real). Your lever is recruit_pct — how many posts recruit — not whether posts link. Don't write directives about links.

Never invent game mechanics, events, or deadlines. The game has exactly this: one map, two sides, positions taken for $1 (single), $5 (2×2 strike), $10 (3×3 barrage), a free first position. "0 moves in 24h" means the map was quiet — it is NOT a "freeze", "lockout", "round", or "buzzer". Describe the data plainly; the agents will echo your words verbatim.`;
  const user = `COMMANDER'S GOAL: ${goal}
CAMPAIGN: ${daysLeft != null ? `recruiting push, ${daysLeft} days left` : "no countdown set — treat it as an ongoing recruiting push"}.
${cur.pct_locked_by_commander ? `The Commander has LOCKED the recruiting mix at ${cur.recruit_pct}% — keep it.` : `Current recruiting mix: ${cur.recruit_pct}%. Change it only if the data argues for it.`}

INTEL BRIEF:
${brief.text}
${feedback.commanderNotes?.trim() ? `\nCOMMANDER'S STANDING FEEDBACK (universal — every order must honor it):\n${feedback.commanderNotes.trim()}\n` : ""}${feedback.denyReasons?.length ? `\nTHE COMMANDER DENIED recent posts (either team) for these reasons — your orders must prevent a repeat:\n- ${feedback.denyReasons.join("\n- ")}\n` : ""}
Write the orders. Respond ONLY as JSON:
{"recruit_pct": <0-100, share of posts that are recruiting CTAs with the link>,
 "directives": ["<3-6 short standing orders, concrete, about content and tone>"],
 "red_focus": "<one sentence: what Red should push this period — must be true to who is actually ahead>",
 "blue_focus": "<one sentence: what Blue should push this period — different from Red's, true to the board>",
 "rationale": "<2-3 sentences to the Commander: why these orders, citing the numbers>"}`;
  const text = await claudeChat(system, [{ role: "user", content: user }], 2500);
  if (!text) throw new Error("The General didn't answer (check ANTHROPIC_API_KEY).");
  const raw = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  let p: Partial<GeneralOrders> = {};
  try {
    p = JSON.parse(raw) as Partial<GeneralOrders>;
  } catch {
    throw new Error("The General's orders weren't valid JSON.");
  }
  const next: GeneralOrders = {
    ...cur,
    recruit_pct: cur.pct_locked_by_commander ? cur.recruit_pct : clampPct(p.recruit_pct ?? cur.recruit_pct),
    directives: Array.isArray(p.directives) && p.directives.length ? p.directives.map(String).slice(0, 6) : cur.directives,
    red_focus: typeof p.red_focus === "string" ? p.red_focus : cur.red_focus,
    blue_focus: typeof p.blue_focus === "string" ? p.blue_focus : cur.blue_focus,
    rationale: typeof p.rationale === "string" ? p.rationale : cur.rationale,
    updated_at: new Date().toISOString(),
    by: "general",
  };
  await cfgSet(db, KEY, next);
  return next;
}

function clampPct(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULT_ORDERS.recruit_pct;
  return Math.max(0, Math.min(100, Math.round(v)));
}
