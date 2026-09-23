// Producer worker: pull the live game data → write a field report (Claude) →
// render the reporter (HeyGen) → composite the broadcast (Remotion) → host it →
// queue a deny-only social_clip post. Runs where Remotion can render (locally /
// a worker), NOT on Vercel. Usage: node scripts/produce-clip.mjs red|blue
// Env: HEYGEN_API_KEY, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY

import { readFile, writeFile, mkdir } from "fs/promises";
import { execSync } from "child_process";

const faction = process.argv[2] === "blue" ? "blue" : "red";
const HG = process.env.HEYGEN_API_KEY;
const AI = process.env.ANTHROPIC_API_KEY;
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SECRET_KEY;

const CAST = {
  red: { name: "Rowan Cross", partner: "Sienna Cole", tp: "575bc6dcb5164a0e8def007c99379687", voice: "19ef3da29d1b474ba9225e58b64b5023", network: "RED TEAM NEWS", accent: "#d23b3b" },
  blue: { name: "Skye Bennett", partner: "Sterling Wells", tp: "3397e024eb4e48c48c45678829327ae7", voice: "ad257b0545cc4892b5400e1cd8efdd9a", network: "BLUE TEAM NEWS", accent: "#356fd0" },
};
const c = CAST[faction];
const sbh = { apikey: SK, Authorization: `Bearer ${SK}` };

// ── Wallet budget guard ─────────────────────────────────────────────────────
// HeyGen's API bills a pay-as-you-go USD wallet (NOT the 600 Studio credits).
// We enforce a per-team daily + monthly $ cap and a wallet floor so neither team
// can drain it and we never depend on auto-reload (which stays OFF as the hard
// stop). Caps live in app_config.heygen_budget so they're tunable without code.
const DEF_BUDGET = { per_team_daily_usd: 0.6, per_team_month_usd: 6.73, wallet_floor_usd: 0.5 };
const today = new Date().toISOString().slice(0, 10);
const monthStart = today.slice(0, 8) + "01";

async function walletUsd() {
  const me = await fetch("https://api.heygen.com/v3/users/me", { headers: { "X-Api-Key": HG } }).then((r) => r.json());
  return Number(me.data?.wallet?.remaining_balance ?? 0);
}
async function budgetCfg() {
  const rows = await fetch(`${SB}/rest/v1/app_config?key=eq.heygen_budget&select=value`, { headers: sbh }).then((r) => r.json());
  let stored = {};
  try { stored = JSON.parse(rows?.[0]?.value ?? "{}"); } catch { /* keep defaults */ } // value is a TEXT column holding JSON
  return { ...DEF_BUDGET, ...stored };
}
async function spentSoFar() {
  const rows = await fetch(`${SB}/rest/v1/heygen_usage?faction=eq.${faction}&day=gte.${monthStart}&select=day,usd_spent`, { headers: sbh }).then((r) => r.json());
  let month = 0, day = 0;
  for (const r of rows ?? []) { month += Number(r.usd_spent); if (r.day === today) day += Number(r.usd_spent); }
  return { day, month };
}
async function recordSpend(usd) {
  const rows = await fetch(`${SB}/rest/v1/heygen_usage?faction=eq.${faction}&day=eq.${today}&select=usd_spent,clips`, { headers: sbh }).then((r) => r.json());
  const prev = rows?.[0] ?? { usd_spent: 0, clips: 0 };
  await fetch(`${SB}/rest/v1/heygen_usage`, {
    method: "POST",
    headers: { ...sbh, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ day: today, faction, usd_spent: Number(prev.usd_spent) + usd, clips: Number(prev.clips) + 1, updated_at: new Date().toISOString() }),
  });
}

const cfg = await budgetCfg();
const wallet0 = await walletUsd();
const used = await spentSoFar();
const blocks = [];
if (wallet0 <= cfg.wallet_floor_usd) blocks.push(`wallet $${wallet0.toFixed(2)} at/below floor $${cfg.wallet_floor_usd}`);
if (used.day >= cfg.per_team_daily_usd) blocks.push(`${faction} hit daily cap $${cfg.per_team_daily_usd} (spent $${used.day.toFixed(2)} today)`);
if (used.month >= cfg.per_team_month_usd) blocks.push(`${faction} hit monthly cap $${cfg.per_team_month_usd} (spent $${used.month.toFixed(2)})`);
if (blocks.length) { console.log(`SKIP ${faction.toUpperCase()} — ${blocks.join("; ")}`); process.exit(0); }
console.log(`BUDGET OK — wallet $${wallet0.toFixed(2)}; ${faction} today $${used.day.toFixed(2)}/${cfg.per_team_daily_usd}, month $${used.month.toFixed(2)}/${cfg.per_team_month_usd}`);
if (process.env.DRYRUN) { console.log("DRYRUN — stopping before any spend."); process.exit(0); }

// 1) pull the board
const tiles = await fetch(`${SB}/rest/v1/tiles?select=team`, { headers: sbh }).then((r) => r.json());
let red = 0, blue = 0;
for (const t of tiles) t.team === "red" ? red++ : t.team === "blue" ? blue++ : null;
const total = red + blue || 1;
const redPct = Math.round((red / total) * 100);
const bluePct = 100 - redPct;
console.log(`BOARD: RED ${redPct}% / BLUE ${bluePct}%`);

// 2) write the field report (Claude, in persona)
const sys = `You are ${c.name}, the ${faction.toUpperCase()} team's field reporter for Dollar Battleground (a paid red-vs-blue tile war; site dollarbattleground.com). You report from the front — urgent, present tense, pro-${faction}, playful. It's a GAME, no real-world harm.`;
const user = `Live board: RED ${redPct}% / BLUE ${bluePct}%. Write a short field report. You are LIVE from the field; ${c.partner} is back at the desk. NEVER use the word "anchor" or "reporter" on air — always use real names. End by tossing back to ${c.partner} BY NAME (e.g. "back to you, ${c.partner.split(" ")[0]}"). Respond ONLY JSON: {"headline":"<UPPERCASE, <=6 words>","spoken":"<what you say on camera, 22-30 words, end by tossing back to ${c.partner} by name>","caption":"<tweet text <=180 chars, include dollarbattleground.com>","angle":"recruit|hype|taunt|update","locator":"GRID x,y"}`;
// Sonnet 5 thinks before it answers; give it room so the JSON isn't cut off,
// and surface exactly what came back when there's no text block.
async function askClaude() {
  const ai = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": AI, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1500, system: sys, messages: [{ role: "user", content: user }] }),
  }).then((r) => r.json());
  const text = ai.content?.find((b) => b.type === "text")?.text;
  if (!text) console.log("CLAUDE: no text block —", JSON.stringify({ error: ai.error ?? null, stop_reason: ai.stop_reason, blocks: ai.content?.map((b) => b.type) }));
  return text ?? "";
}
let raw = await askClaude();
if (!raw) raw = await askClaude(); // one retry — the answer is nondeterministic
raw = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
let plan = {};
try { plan = JSON.parse(raw); } catch { /* handled below */ }
if (!plan.spoken || !plan.headline || !plan.caption) {
  console.log("PLAN FAIL — no usable field report; NOT spending on HeyGen.");
  process.exit(1);
}
console.log("PLAN:", plan);
if (process.env.PLAN_ONLY) { console.log("PLAN_ONLY — stopping before the render."); process.exit(0); }

// 3) render the reporter (HeyGen)
const H = { "X-Api-Key": HG, "Content-Type": "application/json" };
const cr = await fetch("https://api.heygen.com/v2/video/generate", {
  method: "POST", headers: H,
  body: JSON.stringify({ video_inputs: [{ character: { type: "talking_photo", talking_photo_id: c.tp }, voice: { type: "text", input_text: plan.spoken, voice_id: c.voice }, background: { type: "color", value: "#0a0f1e" } }], dimension: { width: 720, height: 1280 } }),
}).then((r) => r.json());
const vid = cr.data?.video_id;
if (!vid) { console.log("HEYGEN FAIL:", JSON.stringify(cr)); process.exit(1); }
console.log("HEYGEN rendering", vid);
let url;
for (let i = 0; i < 200; i++) {
  await new Promise((r) => setTimeout(r, 8000));
  const s = await fetch("https://api.heygen.com/v1/video_status.get?video_id=" + vid, { headers: { "X-Api-Key": HG } }).then((r) => r.json());
  if (s.data?.status === "completed") { url = s.data.video_url; break; }
  if (s.data?.status === "failed") { console.log("HEYGEN failed"); process.exit(1); }
}
if (!url) { console.log("HEYGEN timeout"); process.exit(1); }
// Record the real wallet cost of this render against the team's budget.
await new Promise((r) => setTimeout(r, 5000)); // let billing settle
const wallet1 = await walletUsd();
const cost = Math.max(0, Number((wallet0 - wallet1).toFixed(4)));
await recordSpend(cost);
console.log(`SPEND — this clip $${cost.toFixed(4)}; ${faction} month now $${(used.month + cost).toFixed(2)}/${cfg.per_team_month_usd}; wallet $${wallet1.toFixed(2)}`);
await mkdir("public/_wr", { recursive: true });
await writeFile("public/_wr/clip.mp4", Buffer.from(await (await fetch(url)).arrayBuffer()));
console.log("anchor clip saved");

// 4) composite the broadcast (Remotion)
const props = { network: c.network, accent: c.accent, anchorSrc: "_wr/clip.mp4", reporterName: c.name, role: "field", headline: plan.headline, redPct, bluePct, locator: plan.locator || "GRID 7,4", url: "dollarbattleground.com", variant: "field", seconds: 12 };
await writeFile("/tmp/clip-props.json", JSON.stringify(props));
execSync("npx remotion render src/remotion/index.ts SocialClip /tmp/social-clip.mp4 --props=/tmp/clip-props.json --concurrency=1", { stdio: "inherit" });

// 5) host it
const kkey = `clip-${faction}-${Date.now()}.mp4`;
await fetch(`${SB}/storage/v1/object/media/${kkey}`, { method: "POST", headers: { ...sbh, "Content-Type": "video/mp4" }, body: await readFile("/tmp/social-clip.mp4") });
const mediaUrl = `${SB}/storage/v1/object/public/media/${kkey}`;
console.log("HOSTED:", mediaUrl);

// 6) queue the deny-only post
await fetch(`${SB}/rest/v1/agent_posts`, {
  method: "POST",
  headers: { ...sbh, "Content-Type": "application/json", Prefer: "return=minimal" },
  body: JSON.stringify({ agent: `${faction}_recruiter`, faction, status: "queued", format: "video", angle: plan.angle || "update", network: faction, x_account: faction, video_kind: "social_clip", media_url: mediaUrl, copy: plan.caption, reason: `Auto-produced field report on the ${redPct}/${bluePct} board` }),
});
console.log(`QUEUED social_clip for ${faction.toUpperCase()} — review it in /admin/agents`);
