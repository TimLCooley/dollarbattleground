import "server-only";

// The agents' brain. Given an agent persona + a player's live situation, ask
// Gemini for a short, in-character radio transmission that provokes ONE specific
// buyable action. Returns structured { line, nudge }. Falls back to null on any
// error so the caller can use canned copy.

const MODEL = process.env.GEMINI_MODEL || "gemini-3.6-flash";

export interface Briefing {
  line: string; // punchy hook
  nudge: string; // the specific call to action
}

export interface PlayerSituation {
  side: "red" | "blue" | null;
  held: number;
  actions: number;
  captures: number;
  blue: number;
  red: number;
  enemyRecent: number; // enemy flips in the last hour
  lastTakenCell: { x: number; y: number } | null; // one of their tiles just lost
  rank?: string;
}

export function isBrainConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function buildPrompt(
  agentName: string,
  personality: string,
  s: PlayerSituation,
): string {
  const total = 225;
  const lead =
    s.blue > s.red
      ? `Blue leads (${s.blue}/${total}).`
      : s.red > s.blue
        ? `Red leads (${s.red}/${total}).`
        : "It's dead even.";
  const yours = s.side ? s.side.toUpperCase() : "undecided";
  const situationNotes: string[] = [];
  if (s.lastTakenCell)
    situationNotes.push(
      `The enemy JUST took one of their positions at (${s.lastTakenCell.x}, ${s.lastTakenCell.y}) — a retaliation hook.`,
    );
  if (s.held === 0)
    situationNotes.push("They hold no tiles right now — provoke a first grab.");
  if (s.enemyRecent > 4)
    situationNotes.push("The enemy is on a push — stoke urgency.");
  if (s.actions === 0)
    situationNotes.push("They've never taken an action — get them off the bench.");

  return `You are "${agentName}", an AI game master in a live red-vs-blue territory-war game called Dollar Battleground. Players pay to flip tiles ($1 = take one tile, $5 = X-strike five tiles). Your job is to provoke this specific player into ONE action, in character, playful and game-y — never predatory or manipulative.

Your personality: ${personality}

THIS player's situation:
- Their side: ${yours}
- Tiles they hold: ${s.held}
- Their action points (engagement): ${s.actions}
- Board: Blue ${s.blue} vs Red ${s.red} of ${total}. ${lead}
- Enemy flips in the last hour: ${s.enemyRecent}
${situationNotes.length ? "- Notes: " + situationNotes.join(" ") : ""}

Write a single radio transmission (each field max ~12 words) reacting to their EXACT situation and pushing ONE buyable move. Address them by side or rank, stay in character, no fourth-wall breaks.

Respond ONLY as JSON: {"line": "<punchy hook>", "nudge": "<specific call to action>"}`;
}

export async function generateBriefing(
  agentName: string,
  personality: string,
  situation: PlayerSituation,
): Promise<Briefing | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;

  const prompt = buildPrompt(agentName, personality, situation);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 1.0,
          // Room for the model's internal thinking + the short JSON answer.
          maxOutputTokens: 900,
        },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    const parsed = JSON.parse(text) as { line?: string; nudge?: string };
    if (!parsed.line) return null;
    return { line: parsed.line, nudge: parsed.nudge ?? "" };
  } catch {
    return null;
  }
}
