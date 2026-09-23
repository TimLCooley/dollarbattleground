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
  commanderNotes?: string; // standing feedback from the Commander — applies to every agent, outranks orders
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
// What a stranger needs to hear. Recruiting posts are written for someone
// who has never seen the game — the pitch comes first, the scoreboard is
// seasoning.
const PITCH =
  "WHAT THE GAME IS (the reader has never heard of it): Dollar Battleground is a live map where Red and Blue fight for territory. You pick a side, your first position is free, then a dollar takes a position ($5 takes a 2×2 strike, $10 a 3×3 barrage). The map is public and every move shows up live.";

const ANGLE_GUIDE: Record<Angle, string> = {
  recruit:
    "An INVITATION to someone who has never heard of the game — NOT a score update. Lead with the pitch (pick a side, first position free, a dollar takes a position) and make it about THEM. A board fact is seasoning: one at most, never the opening line. End with the link dollarbattleground.com.",
  teaser: "A coming-soon hook that makes someone want to pick a side before launch. Include the link dollarbattleground.com.",
  update: "A war-desk update: what actually happened on the map — ground gained or lost, by direction (the east, the south, the center). NO link. Reads like an account reporting, not selling.",
  hype: "Pump your own side. Swagger with specifics. NO link.",
  taunt: "Rib the other team — playful, dry, never cruel, never about real people or real politics. NO link.",
};

const EXEMPLARS: Record<Angle, string[]> = {
  recruit: [
    "There's a map. Red vs Blue, fighting for ground. A dollar takes a position and your first one's free. Pick Red: dollarbattleground.com",
    "You've got a dollar and an opinion. That's the whole entry fee. Take a position for Blue: dollarbattleground.com",
    "New here? One map, two sides, every move is live. Your first position's on us — plant a Red flag: dollarbattleground.com",
    "Red isn't taking everyone. 14 days left to enlist in the founding class — earn your rank on the line: dollarbattleground.com",
    "$5 doesn't buy you ground. It buys you a commission. Join Blue as a Second Lieutenant: dollarbattleground.com",
  ],
  teaser: ["The map opens soon. Red or Blue — decide before your neighbor does: dollarbattleground.com"],
  update: [
    "Overnight: Blue pushed up from the south and took nine positions. Red held the east. Map's dead even at 113–112.",
    "The northwest has changed hands three times this week. Nobody's holding it. Nobody's leaving it alone either.",
  ],
  hype: ["Red doesn't hold the line. Red IS the line. 🔴", "Half the map. Zero panic. That's the Blue way."],
  taunt: [
    "Red's been 'about to break through' in the west for two days now. We've started leaving snacks.",
    "Blue calls it 'strategic patience.' We call it 112 positions and counting down.",
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
  "flip a tile",
  "flip tiles",
  "tile flipping",
  "flipping tiles",
];

// What recruiting posts are actually about. All four are true — rotate them,
// don't stack them.
function recruitThemes(daysLeft?: number | null): string {
  return `RECRUITING THEMES (pick one or two per post, rotate across posts):
- SELECTIVE: we're looking for the best. This side earns its rank on the line; not everyone makes the cut.
- COUNTDOWN (real): ${daysLeft != null ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in the recruiting campaign — join now and you're in the founding class of your side.` : "the recruiting campaign is open now — join and you're in the founding class of your side."}
- OFFICER PATH (real mechanic): a $5 strike commissions you as a Second Lieutenant — you can join as an OFFICER, not a private, and earn rank from there.
- LOW FRICTION: your first position is free; a dollar takes a position.`;
}

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

${PITCH}
${input.commanderNotes?.trim() ? `\nCOMMANDER'S STANDING FEEDBACK — applies to every agent and every post, and outranks the General's orders:\n${input.commanderNotes.trim()}\n` : ""}
THIS POST'S ANGLE: ${angle.toUpperCase()} — ${ANGLE_GUIDE[angle]}
${angle === "recruit" ? recruitThemes(input.daysLeft) + "\n" : ""}(The angle's link rule is absolute and overrides any standing order: only recruit/teaser posts carry the link. The General controls how OFTEN you recruit, not whether this post links.)

VOICE RULES: ≤ 240 characters. Vary length — some posts are one line. At most one emoji, usually none. No hashtags. No exclamation-point pileups. Specifics over adjectives. Write like the person behind the account, not a campaign.
TERRITORY LANGUAGE ONLY: this is a territory war. Say positions, ground, territory, fronts, and compass directions — "pushing in from the south", "the eastern front", "the northwest", "the center". NEVER grid coordinates (no "4,7", no "H8" — nobody knows what they mean) and NEVER "flip tiles" / "tile flipping". You "take a position", "take ground", "hold the line".
NEVER invent game mechanics, events, or deadlines — no "freeze", "lockout", "round", "buzzer", "season" unless the brief literally says so. The game is: one map, two sides, positions taken for $1 (single), $5 (2×2 strike), $10 (3×3 barrage), first position free. A quiet map is just a quiet map.
NEVER USE: ${BANNED.map((b) => `"${b}"`).join(", ")}.
STYLE EXAMPLES for this angle (do NOT copy them; match the feel):
- ${EXEMPLARS[angle].join("\n- ")}
${input.recentCopies?.length ? `\nDO NOT REPEAT these recent posts (new idea, new wording): ${input.recentCopies.map((c) => `"${c}"`).join("; ")}` : ""}
${input.denyReasons?.length ? `\nTHE COMMANDER DENIED recent posts (from either team — his feedback is universal) for these reasons; treat each as a rule: ${input.denyReasons.map((r) => `"${r}"`).join("; ")}` : ""}

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
