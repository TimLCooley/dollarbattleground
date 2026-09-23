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
  recentThemes?: Theme[]; // newest first — the next post leads with a different one
  denyReasons?: string[];
  brief?: IntelBrief | null;
  orders?: GeneralOrders | null;
  commanderNotes?: string; // standing feedback from the Commander — applies to every agent, outranks orders
  forceAngle?: Angle;
  forceTheme?: Theme; // refresh-at-post keeps the placeholder's theme
  forceFormat?: "text" | "video"; // video placeholders are decided by the schedule, not the model
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
  "WHAT THE GAME IS (the reader has never heard of it): Dollar Battleground is a live map where Red and Blue fight for territory. You pick a side, your first position is free, then you take positions, launch strikes and barrages to take ground. A strike commissions you as an officer. The map is public and every move shows up live.\nMONEY RULE: never mention spending money or prices — no dollar amounts, ever. \"First position is free\" is fine; \"$5\" is not.";

const ANGLE_GUIDE: Record<Angle, string> = {
  recruit:
    "THIS IS AN AD, and every ad is an EXPERIMENT. Quality bar = the first style example: that clear, that direct, 2–4 short sentences, ending with the link dollarbattleground.com. Ingredients to draw from: the real countdown ('N days left…'), the offer (pick your side / first position's free / join as an officer), where we need boots by front. But NEVER reuse the wording or opening of a recent post — lead with this post's assigned theme, vary the hook, the length, the front you name. No scoreboard. No story. Say it straight.",
  teaser: "A coming-soon hook that makes someone want to pick a side before launch. Include the link dollarbattleground.com.",
  update: "A war-desk update: what actually happened on the map — ground gained or lost, by direction (the east, the south, the center). NO link. Reads like an account reporting, not selling.",
  hype: "Pump your own side. Swagger with specifics. NO link.",
  taunt: "Rib the other team — playful, dry, never cruel, never about real people or real politics. NO link.",
};

const EXEMPLARS: Record<Angle, string[]> = {
  recruit: [
    // The Commander's gold standard — match this SHAPE: countdown → pick your side + first position's free → where we need boots (by front) → link.
    "15 days left to join Blue's founding class. Pick your side, first position's free. We need boots on the western and center fronts. dollarbattleground.com",
    "14 days left to join Red's founding class. Claim your spot — first position's free. We need officers on the eastern front. dollarbattleground.com",
    "Join as an officer: one strike commissions you Second Lieutenant. 13 days left in Blue's recruiting window. We need boots in the south. dollarbattleground.com",
    "We're looking for the best. 12 days left to claim your spot in Red's founding class — first position's free. Hold the center with us. dollarbattleground.com",
  ],
  teaser: ["The map opens soon. Red or Blue — decide before your neighbor does: dollarbattleground.com"],
  update: [
    "Overnight: Blue pushed up from the south and took ground. Red held the east. The map is close.",
    "The northwest has changed hands three times this week. Nobody's holding it. Nobody's leaving it alone either.",
  ],
  hype: ["Red doesn't hold the line. Red IS the line. 🔴", "Half the map. Zero panic. That's the Blue way."],
  taunt: [
    "Red's been 'about to break through' in the west for two days now. We've started leaving snacks.",
    "Blue calls it 'strategic patience.' We call it a countdown.",
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

// What recruiting posts are actually about. All four are true. Each post
// LEADS with one theme — scheduled so consecutive posts differ — and the
// agent states what it's testing, so Intel can score themes against clicks.
export type Theme = "countdown" | "officer" | "selective" | "free";
const THEMES: Theme[] = ["countdown", "officer", "selective", "free"];

export function chooseTheme(recentThemes: Theme[] = []): Theme {
  const avoid = new Set(recentThemes.slice(0, 2));
  const pool = THEMES.filter((t) => !avoid.has(t));
  return (pool.length ? pool : THEMES)[Math.floor(Math.random() * (pool.length || THEMES.length))];
}

// Themes are tagged into `reason` ("[theme:officer] …") so they round-trip
// through the DB without a schema change.
export function themeOf(reason: string | null | undefined): Theme | null {
  const m = reason?.match(/\[theme:(countdown|officer|selective|free)\]/);
  return (m?.[1] as Theme) ?? null;
}

function recruitThemes(lead: Theme, daysLeft?: number | null): string {
  const countdown =
    daysLeft != null
      ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in the recruiting campaign — join now and you're in the founding class of your side.`
      : "the recruiting campaign is open now — join and you're in the founding class of your side.";
  const all: Record<Theme, string> = {
    selective: "SELECTIVE: we're looking for the best. This side earns its rank on the line; not everyone makes the cut.",
    countdown: `COUNTDOWN (real): ${countdown}`,
    officer: "OFFICER PATH (real mechanic): a strike commissions you as a Second Lieutenant — you can join as an OFFICER, not a private. (Never say what it costs.)",
    free: "FREE FIRST POSITION: your first position is free — the lowest-friction way in.",
  };
  return `THIS POST'S LEAD THEME: ${lead.toUpperCase()} — open with it. You may fold in ONE other theme, no more.
${THEMES.map((t) => (t === lead ? "→ " : "  ") + all[t]).join("\n")}
EXPERIMENT: every post tests something. Vary the opening, the sentence count (2–4), which front you name, and the call to action. In "reason", state the hypothesis in one line, e.g. "Testing officer hook with no fronts named, 2 sentences."`;
}

function buildPrompt(input: DecideInput, angle: Angle, theme: Theme): { system: string; user: string } {
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

${angle === "recruit" ? `MAP RIGHT NOW (background only — do NOT put the score in an ad): ${input.brief?.text.split("\n")[0] ?? "quiet."}` : `INTEL BRIEF (live):\n${input.brief?.text ?? "No brief available — keep it general and honest."}`}

${PITCH}
${input.commanderNotes?.trim() ? `\nCOMMANDER'S STANDING FEEDBACK — applies to every agent and every post, and outranks the General's orders:\n${input.commanderNotes.trim()}\n` : ""}
THIS POST'S ANGLE: ${angle.toUpperCase()} — ${ANGLE_GUIDE[angle]}
${angle === "recruit" ? recruitThemes(theme, input.daysLeft) + "\n" : ""}(The angle's link rule is absolute and overrides any standing order: only recruit/teaser posts carry the link. The General controls how OFTEN you recruit, not whether this post links.)

VOICE RULES: ≤ 200 characters. At most one emoji, usually none. No hashtags. No exclamation-point pileups. ${angle === "recruit" ? "Recruiting posts are ADS: plain, confident, direct — offer, urgency, call to action. Do not try to be clever or tell a story." : "Specifics over adjectives. Write like the person behind the account."}
TERRITORY LANGUAGE ONLY: this is a territory war. Say positions, ground, territory, fronts, and compass directions — "pushing in from the south", "the eastern front", "the northwest", "the center". NEVER grid coordinates (no "4,7", no "H8" — nobody knows what they mean) and NEVER "flip tiles" / "tile flipping". You "take a position", "take ground", "hold the line".
NEVER mention spending money or prices — no dollar amounts, ever. Say "take a position", "a strike commissions you", "first position free".
NEVER invent game mechanics, events, or deadlines — no "freeze", "lockout", "round", "buzzer", "season" unless the brief literally says so. The game is: one map, two sides, positions, strikes (2×2), barrages (3×3), first position free, a strike commissions you as an officer. A quiet map is just a quiet map.
NEVER USE: ${BANNED.map((b) => `"${b}"`).join(", ")}.
STYLE EXAMPLES for this angle (the QUALITY BAR — match the clarity, never the wording):
- ${EXEMPLARS[angle].join("\n- ")}
${input.recentCopies?.length ? `\nRECENT POSTS — do NOT reuse their opening line, structure, or phrasing; this one must read as a different experiment: ${input.recentCopies.map((c) => `"${c}"`).join("; ")}` : ""}
${input.denyReasons?.length ? `\nTHE COMMANDER DENIED recent posts (from either team — his feedback is universal) for these reasons; treat each as a rule: ${input.denyReasons.map((r) => `"${r}"`).join("; ")}` : ""}

Format is "text" unless the brief shows a genuinely notable board swing worth a field report (then "video" with videoKind "social_clip").
Respond ONLY as JSON: {"copy":"<the post>","format":"text|video","videoKind":"social_clip|null","reason":"<one sentence to the Commander: why this post now>"}`;
  return { system, user };
}

function parseDraft(text: string | null | undefined, input: DecideInput, angle: Angle, theme: Theme): PostDraft | null {
  if (!text) return null;
  const raw = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    const p = JSON.parse(raw) as Partial<PostDraft>;
    if (!p.copy?.trim()) return null;
    const copy = p.copy.trim();
    // Guardrails the model may have ignored: no prices, ever; link only on recruit/teaser.
    if (/\$\s?\d|\d+\s?(dollars?|bucks)\b/i.test(copy)) return null;
    const linked = /dollarbattleground\.com/i.test(copy);
    const shouldLink = angle === "recruit" || angle === "teaser";
    if (shouldLink && !linked) return null;
    if (!shouldLink && linked) return null;
    return {
      format: p.format === "video" ? "video" : "text",
      angle,
      xAccount: input.faction,
      copy,
      videoKind: p.videoKind === "social_clip" ? "social_clip" : null,
      videoSpec: null,
      // Tag the lead theme so it round-trips (variety scheduling + Intel scoring).
      reason: `[theme:${theme}] ${typeof p.reason === "string" ? p.reason : ""}`.trim(),
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
  const theme = input.forceTheme ?? chooseTheme(input.recentThemes ?? []);
  const { system, user } = buildPrompt(input, angle, theme);
  const finish = (d: PostDraft | null): PostDraft | null => {
    if (!d || !input.forceFormat) return d;
    return { ...d, format: input.forceFormat, videoKind: input.forceFormat === "video" ? "social_clip" : null };
  };

  // Claude first (two tries — the guardrails can reject a draft), then Gemini.
  if (claudeConfigured()) {
    for (let i = 0; i < 2; i++) {
      const d = parseDraft(await claudeChat(system, [{ role: "user", content: user }], 2000), input, angle, theme);
      if (d) return finish(d);
    }
  }
  for (let i = 0; i < 2; i++) {
    const d = parseDraft(await gemini(system, user), input, angle, theme);
    if (d) return finish(d);
  }
  return null;
}
