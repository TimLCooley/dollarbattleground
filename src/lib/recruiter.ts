import "server-only";
import { agentByKey, type Faction } from "./agents";

// Per-faction recruiter brain. Given a GOAL and context, the Red or Blue
// recruiter decides its next post (text or video) in ITS voice, targeting ITS X
// account. Deny-only: whatever it returns is queued unless the Commander vetoes;
// it learns from recent deny reasons. Uses Gemini.

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

export type Angle = "recruit" | "teaser" | "hype" | "taunt" | "update";

export interface PostDraft {
  format: "text" | "video";
  angle: Angle; // the agent decides the post's job
  xAccount: Faction; // which handle posts it
  copy: string;
  videoKind: "coming_soon" | "social_clip" | null;
  videoSpec: Record<string, unknown> | null;
  reason: string;
}

export interface DecideInput {
  faction: Faction;
  goal: string;
  phase: "prelaunch" | "live";
  daysLeft?: number | null; // campaign countdown, for urgency
  recentCopies?: string[];
  denyReasons?: string[];
  board?: { redPct: number; bluePct: number } | null;
}

function buildPrompt(input: DecideInput): string {
  const rec = agentByKey(`${input.faction}_recruiter`);
  const handle = input.faction === "red" ? "@RedBattleGround" : "@BluBattleGround";
  const media =
    input.phase === "prelaunch"
      ? `format "text", or format "video" with videoKind "coming_soon" (a branded teaser).`
      : `format "text", or format "video" with videoKind "coming_soon" (teaser) or "social_clip" (your anchor/field reporter reacting to a real board swing).`;

  return `${rec?.persona ?? ""}

You RUN the ${handle} X account for the ${input.faction.toUpperCase()} team in Dollar Battleground (players pay $1-$10 to flip tiles; site dollarbattleground.com).

YOUR GOAL: ${input.goal}
CURRENT CAMPAIGN: ${input.daysLeft != null ? `RECRUITING — ${input.daysLeft} days left. Most posts should serve recruiting, but` : "RECRUITING, but"} YOU decide each post's angle and vary the mix so the feed feels like a REAL account, not a billboard.
PHASE: ${input.phase === "prelaunch" ? "PRE-LAUNCH — the site shows COMING SOON. Build hype + a waitlist; get people to pick YOUR side. Do NOT claim it's live yet." : "LIVE — the game is playable."}
${input.board ? `Board: RED ${input.board.redPct}% / BLUE ${input.board.bluePct}%.` : ""}

Choose the post's ANGLE:
- "recruit" — a rally/CTA. INCLUDE the dollarbattleground.com link.
- "teaser" — coming-soon hook. INCLUDE the link.
- "hype" — build excitement for your side. NO link — just personality.
- "taunt" — rib the other team. NO link.
- "update" — news about the war/board. Usually NO link.
Only "recruit" and "teaser" include the link. The rest are normal engagement posts (most real posts have no link — it also helps reach). Mix them up.

Media: ${media} Not every post is a video.

Rules: on-brand, punchy, playful rivalry, never spammy/misleading, no real-world harm, no real politics.
${input.recentCopies?.length ? `Do NOT repeat: ${input.recentCopies.map((c) => `"${c}"`).join("; ")}.` : ""}
${input.denyReasons?.length ? `The Commander DENIED posts for these reasons — respect them: ${input.denyReasons.map((r) => `"${r}"`).join("; ")}.` : ""}

Respond ONLY as JSON:
{"angle":"recruit|teaser|hype|taunt|update","format":"text|video","copy":"<tweet, <=270 chars; include dollarbattleground.com ONLY for recruit/teaser>","videoKind":"coming_soon|social_clip|null","reason":"<one sentence: why this post now>"}`;
}

export async function decideNextPost(input: DecideInput): Promise<PostDraft | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(input) }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 1.0, maxOutputTokens: 900 },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const p = JSON.parse(text) as Partial<PostDraft>;
    if (!p.copy) return null;
    const angles: Angle[] = ["recruit", "teaser", "hype", "taunt", "update"];
    return {
      format: p.format === "video" ? "video" : "text",
      angle: angles.includes(p.angle as Angle) ? (p.angle as Angle) : "recruit",
      xAccount: input.faction,
      copy: p.copy,
      videoKind: p.videoKind === "coming_soon" || p.videoKind === "social_clip" ? p.videoKind : null,
      videoSpec: null,
      reason: p.reason ?? "",
    };
  } catch {
    return null;
  }
}
