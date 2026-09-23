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
export async function planOrders(
  db: Db,
  brief: IntelBrief,
  goal: string,
  daysLeft: number | null,
): Promise<GeneralOrders> {
  const cur = await getOrders(db);
  const persona = agentByKey("general")?.persona ?? "You are THE GENERAL.";
  const system = `${persona}

You are writing STANDING ORDERS for the two Social agents (Red Social runs @RedBattleGround, Blue Social runs @BluBattleGround). They will follow these orders on every post until you change them. Be specific and practical; you're a commander, not a consultant.`;
  const user = `COMMANDER'S GOAL: ${goal}
CAMPAIGN: ${daysLeft != null ? `recruiting push, ${daysLeft} days left` : "no countdown set — treat it as an ongoing recruiting push"}.
${cur.pct_locked_by_commander ? `The Commander has LOCKED the recruiting mix at ${cur.recruit_pct}% — keep it.` : `Current recruiting mix: ${cur.recruit_pct}%. Change it only if the data argues for it.`}

INTEL BRIEF:
${brief.text}

Write the orders. Respond ONLY as JSON:
{"recruit_pct": <0-100, share of posts that are recruiting CTAs with the link>,
 "directives": ["<3-6 short standing orders, concrete, about content and tone>"],
 "red_focus": "<one sentence: what Red should push this period>",
 "blue_focus": "<one sentence: what Blue should push this period>",
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
