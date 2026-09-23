import "server-only";
import { agentByKey, type Faction } from "./agents";
import { claudeChat, claudeConfigured } from "./claude";
import type { IntelBrief } from "./intel";
import type { GeneralOrders } from "./general";

// The Social agents' brain. The chain of command: the General's standing
// orders decide the MIX (how often we recruit), this module schedules the
// angle for each post deterministically from that mix, and then the agent
// writes ONE post for that angle in its own voice, working from the Intel
// brief's real numbers. Claude writes the copy; Gemini is the fallback.
// Deny-only: whatever comes back is queued unless the Commander vetoes, and
// deny reasons feed back into the next prompt.

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

export type Angle = "recruit" | "teaser" | "hype" | "taunt" | "update";

export interface PostDraft {
  format: "text" | "video";
  angle: Angle;
  xAccount: Faction;
  copy: string;
  videoKind: "coming_soon" | "social_clip" | null;
  videoSpec: Record<string, unknown> | null;
  reason: string;
}

export interface DecideInput {
  faction: Faction;
  goal: string;
  phase: "prelaunch" | "live";
  daysLeft?: number | null;
  recentCopies?: string[];
  recentAngles?: Angle[]; // newest first
  denyReasons?: string[];
  brief?: IntelBrief | null;
  orders?: GeneralOrders | null;
  forceAngle?: Angle;
}

// ── angle scheduling ────────────────────────────────────────────────────────
// recruit with probability recruit_pct; otherwise a normal post. Never the
// same non-recruit angle three times running, never two recruits back to back
// unless the mix is ≥ 80%.
export function chooseAngle(recruitPct: number, recentAngles: Angle[] = [], phase: "prelaunch" | "live" = "live"): Angle {
  const p = Math.max(0, Math.min(100, recruitPct)) / 100;
  const last = recentAngles[0];
  const wantsRecruit = Math.random() < p && !(last === "recruit" && p < 0.8);
  if (wantsRecruit) return phase === "prelaunch" ? (Math.random() < 0.5 ? "teaser" : "recruit") : "recruit";
  const pool: { a: Angle; w: number }[] = [
    { a: "update", w: 45 },
    { a: "hype", w: 30 },
    { a: "taunt", w: 25 },
  ];
  const twoInARow = recentAngles[0] && recentAngles[0] === recentAngles[1] ? recentAngles[0] : null;
  const usable = pool.filter((x) => x.a !== twoInARow);
  const total = usable.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const x of usable) {
    r -= x.w;
    if (r <= 0) return x.a;
  }
  return "update";
}

// ── the brief for one post ──────────────────────────────────────────────────
const ANGLE_GUIDE: Record<Angle, string> = {
  recruit:
    "A direct ask to join YOUR side. Give ONE concrete reason it matters right now (a real number or event from the brief), talk to one person, and end with the link dollarbattleground.com.",
  teaser: "A coming-soon hook that makes someone want to pick a side before launch. Include the link dollarbattleground.com.",
  update: "A war-desk update: what actually happened on the board — real flips, real cells, real counts. NO link. Reads like an account reporting, not selling.",
  hype: "Pump your own side. Swagger with specifics. NO link.",
  taunt: "Rib the other team — playful, dry, never cruel, never about real people or real politics. NO link.",
};

const EXEMPLARS: Record<Angle, string[]> = {
  recruit: [
    "Blue took 6 of our tiles overnight. Six. Board's 113–112 and the east edge is open — Red needs one more pair of hands at the line: dollarbattleground.com",
    "You've got a dollar and an opinion. That's all it takes to flip a tile. Pick Blue: dollarbattleground.com",
  ],
  teaser: ["The map opens soon. Red or Blue — decide before your neighbor does: dollarbattleground.com"],
  update: [
    "Overnight: 14 flips, 9 of them ours. Column 7 changed hands three times before breakfast. Board's dead even at 113–112.",
    "Cell 4,7 has flipped 9 times this week. Nobody's holding it. Nobody's leaving it alone either.",
  ],
  hype: ["Red doesn't hold the line. Red IS the line. 🔴", "Half the board. Zero panic. That's the Blue way."],
  taunt: [
    "Red's been 'about to break through' at 4,7 for two days now. We've started leaving snacks.",
    "Blue calls it 'strategic patience.' We call it 112 tiles and counting down.",
  ],
};

const BANNED = [
  "fresh recruits",
  "absolute victory",
  "join the fight today",
  "don't miss out",
  "game-changer",
  "unleash",
  "epic",
  "not on our watch",
  "secure victory",
  "take ground now",
  "the battle is on",
];

function buildPrompt(input: DecideInput, angle: Angle): { system: string; user: string } {
  const rec = agentByKey(`${input.faction}_recruiter`);
  const handle = input.faction === "red" ? "@RedBattleGround" : "@BluBattleGround";
  const other = input.faction === "red" ? "Blue" : "Red";
  const o = input.orders;
  const focus = o ? (input.faction === "red" ? o.red_focus : o.blue_focus) : "";

  const system = `${rec?.persona ?? ""}
${rec?.goals?.length ? `YOUR GOALS:\n- ${rec.goals.join("\n- ")}` : ""}

You run ${handle}. You are writing exactly ONE post. Everything you say must be true to the Intel brief — never invent numbers, cells, or events. Rivalry with ${other} is theater: it's a game, never real-world harm, no real politics, no real people.`;

  const user = `GOAL: ${input.goal}
PHASE: ${input.phase === "prelaunch" ? "PRE-LAUNCH — the site shows COMING SOON; do not claim it's live." : "LIVE — the war is on and the board is playable."}
CAMPAIGN: ${input.daysLeft != null ? `recruiting push, ${input.daysLeft} days left.` : "recruiting push, no countdown set."}

STANDING ORDERS FROM THE GENERAL (recruiting mix ${o?.recruit_pct ?? 60}%):
- ${(o?.directives ?? []).join("\n- ") || "Use real numbers. Sound like a person."}
${focus ? `YOUR TEAM'S FOCUS: ${focus}` : ""}

INTEL BRIEF (live):
${input.brief?.text ?? "No brief available — keep it general and honest."}

THIS POST'S ANGLE: ${angle.toUpperCase()} — ${ANGLE_GUIDE[angle]}
(The angle's link rule is absolute and overrides any standing order: only recruit/teaser posts carry the link. The General controls how OFTEN you recruit, not whether this post links.)

VOICE RULES: ≤ 240 characters. Vary length — some posts are one line. At most one emoji, usually none. No hashtags. No exclamation-point pileups. Specifics over adjectives. Write like the person behind the account, not a campaign.
NEVER USE: ${BANNED.map((b) => `"${b}"`).join(", ")}.
STYLE EXAMPLES for this angle (do NOT copy them; match the feel):
- ${EXEMPLARS[angle].join("\n- ")}
${input.recentCopies?.length ? `\nDO NOT REPEAT these recent posts (new idea, new wording): ${input.recentCopies.map((c) => `"${c}"`).join("; ")}` : ""}
${input.denyReasons?.length ? `\nTHE COMMANDER DENIED earlier posts for these reasons — respect them: ${input.denyReasons.map((r) => `"${r}"`).join("; ")}` : ""}

Format is "text" unless the brief shows a genuinely notable board swing worth a field report (then "video" with videoKind "social_clip").
Respond ONLY as JSON: {"copy":"<the post>","format":"text|video","videoKind":"coming_soon|social_clip|null","reason":"<one sentence to the Commander: why this post now>"}`;
  return { system, user };
}

function parseDraft(text: string | null | undefined, input: DecideInput, angle: Angle): PostDraft | null {
  if (!text) return null;
  const raw = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    const p = JSON.parse(raw) as Partial<PostDraft>;
    if (!p.copy?.trim()) return null;
    const copy = p.copy.trim();
    // Guardrails the model may have ignored: link only on recruit/teaser.
    const linked = /dollarbattleground\.com/i.test(copy);
    const shouldLink = angle === "recruit" || angle === "teaser";
    if (shouldLink && !linked) return null;
    if (!shouldLink && linked) return null;
    return {
      format: p.format === "video" ? "video" : "text",
      angle,
      xAccount: input.faction,
      copy,
      videoKind: p.videoKind === "coming_soon" || p.videoKind === "social_clip" ? p.videoKind : null,
      videoSpec: null,
      reason: typeof p.reason === "string" ? p.reason : "",
    };
  } catch {
    return null;
  }
}

async function gemini(system: string, user: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 1.0, maxOutputTokens: 900 },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

export async function decideNextPost(input: DecideInput): Promise<PostDraft | null> {
  const angle = input.forceAngle ?? chooseAngle(input.orders?.recruit_pct ?? 60, input.recentAngles ?? [], input.phase);
  const { system, user } = buildPrompt(input, angle);

  // Claude first (two tries — the link guardrail can reject a draft), then Gemini.
  if (claudeConfigured()) {
    for (let i = 0; i < 2; i++) {
      const d = parseDraft(await claudeChat(system, [{ role: "user", content: user }], 2000), input, angle);
      if (d) return d;
    }
  }
  for (let i = 0; i < 2; i++) {
    const d = parseDraft(await gemini(system, user), input, angle);
    if (d) return d;
  }
  return null;
}
