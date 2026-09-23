// Producer worker: write the script from LIVE data (Claude) → render the
// correspondent (HeyGen) → composite the broadcast (Remotion) → host it →
// attach it to its post. Runs where Remotion can render (GitHub Actions /
// locally), NOT on Vercel.
//
// Usage:
//   node scripts/produce-clip.mjs due                    — render every video
//       placeholder due within the next 2 hours and attach the clip to it
//       (the scheduled mode: drafts are placeholders, the clip is made right
//       before posting from that moment's data)
//   node scripts/produce-clip.mjs red|blue [field|recruit] — make a clip now
//       and queue it as a new post (manual)
// Env: HEYGEN_API_KEY, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SECRET_KEY
// Flags: DRYRUN=1 (stop after the budget guard), PLAN_ONLY=1 (stop after the
// script), FORCE=1 (ignore the mix / dedupe / unchanged-map skips)

import { readFile, writeFile, mkdir } from "fs/promises";
import { execSync } from "child_process";

const HG = process.env.HEYGEN_API_KEY;
const AI = process.env.ANTHROPIC_API_KEY;
const SB = process.env.SUPABASE_URL;
const SK = process.env.SUPABASE_SECRET_KEY;
const sbh = { apikey: SK, Authorization: `Bearer ${SK}` };

// Every correspondent has several looks — a different one each run.
const CAST = {
  red: {
    network: "RED TEAM NEWS",
    accent: "#d23b3b",
    field: { name: "Rowan Cross", partner: "Sienna Cole", voice: "19ef3da29d1b474ba9225e58b64b5023", looks: ["575bc6dcb5164a0e8def007c99379687", "50fd081c1e054f9d9442e29902f77d02", "1c0e5019994a49899ef200b6bf5ee2fb", "0bbfefa0bb52402e86fb711b013bceff", "c7b3b6756b26462fb1e5159de8f8821c"] },
    anchor: { name: "Sienna Cole", voice: "0bbfbda5aa924a68a9d1da7b8496052a", looks: ["e8fdc59e7b994d39b464930c9dedabce", "573636c71aa1433c974971402a00c66e", "3c857e6b5132460aa024f8ec012c84f1", "e8fd71ea30aa472b8364cd84e850a8e7", "30d7ba268f5b4d8198f6badd7f286790"] },
  },
  blue: {
    network: "BLUE TEAM NEWS",
    accent: "#356fd0",
    field: { name: "Skye Bennett", partner: "Sterling Wells", voice: "ad257b0545cc4892b5400e1cd8efdd9a", looks: ["3397e024eb4e48c48c45678829327ae7", "f7db61b05fa34645bc96f5c438c0580c", "d259ba87a62e46b384a32084bca8e343", "5a1559b14ce9436899b4085916aa2ac8", "5f819e65ddcf45f28c4fc6fc865c3bb2", "53cd21e322a14aa4a54d4a37193bd487"] },
    anchor: { name: "Sterling Wells", voice: "810ea13d55f045b68c75cbcbda7ce14a", looks: ["b950798aeb554ce4b9e76f77297d6e2b", "49e594f3bb794215bdad62884e4e1b40", "d92b800c58034cb69d3cfdf970e8a6ea", "1791f77c8d6b44bd87d3352aea1d1553"] },
  },
};

const DEF_BUDGET = { per_team_daily_usd: 0.5, per_team_month_usd: 15, wallet_floor_usd: 0.25 };
const ENGINE = process.env.HEYGEN_ENGINE || "avatar_iii"; // see the render step
const today = new Date().toISOString().slice(0, 10);
const monthStart = today.slice(0, 8) + "01";

async function cfg(key) {
  const rows = await fetch(`${SB}/rest/v1/app_config?key=eq.${key}&select=value`, { headers: sbh }).then((r) => r.json());
  try { return JSON.parse(rows?.[0]?.value ?? "null"); } catch { return null; }
}
async function walletUsd() {
  const me = await fetch("https://api.heygen.com/v3/users/me", { headers: { "X-Api-Key": HG } }).then((r) => r.json());
  return Number(me.data?.wallet?.remaining_balance ?? 0);
}
async function spentSoFar(faction) {
  const rows = await fetch(`${SB}/rest/v1/heygen_usage?faction=eq.${faction}&day=gte.${monthStart}&select=day,usd_spent`, { headers: sbh }).then((r) => r.json());
  let month = 0, day = 0;
  for (const r of rows ?? []) { month += Number(r.usd_spent); if (r.day === today) day += Number(r.usd_spent); }
  return { day, month };
}
async function recordSpend(faction, usd) {
  const rows = await fetch(`${SB}/rest/v1/heygen_usage?faction=eq.${faction}&day=eq.${today}&select=usd_spent,clips`, { headers: sbh }).then((r) => r.json());
  const prev = rows?.[0] ?? { usd_spent: 0, clips: 0 };
  await fetch(`${SB}/rest/v1/heygen_usage`, {
    method: "POST",
    headers: { ...sbh, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ day: today, faction, usd_spent: Number(prev.usd_spent) + usd, clips: Number(prev.clips) + 1, updated_at: new Date().toISOString() }),
  });
}

// ── one clip ────────────────────────────────────────────────────────────────
// target: an existing placeholder post to attach the clip to; otherwise a new
// post is queued. Returns true if a clip was produced.
async function produce({ faction, kind, target = null }) {
  const team = CAST[faction];
  const who = kind === "recruit" ? team.anchor : team.field;
  const look = who.looks[Math.floor(Math.random() * who.looks.length)];
  const SIDE = faction.toUpperCase();
  const Side = faction === "red" ? "Red" : "Blue";

  // Wallet budget guard: per-team daily + monthly $ caps and a wallet floor.
  // Video only — text posts never touch this.
  const budget = { ...DEF_BUDGET, ...((await cfg("heygen_budget")) ?? {}) };
  const wallet0 = await walletUsd();
  const used = await spentSoFar(faction);
  const blocks = [];
  if (wallet0 <= budget.wallet_floor_usd) blocks.push(`wallet $${wallet0.toFixed(2)} at/below floor $${budget.wallet_floor_usd}`);
  if (used.day >= budget.per_team_daily_usd) blocks.push(`${faction} hit daily video cap $${budget.per_team_daily_usd} (spent $${used.day.toFixed(2)} today)`);
  if (used.month >= budget.per_team_month_usd) blocks.push(`${faction} hit monthly video cap $${budget.per_team_month_usd} (spent $${used.month.toFixed(2)})`);
  if (blocks.length) { console.log(`SKIP ${SIDE} — ${blocks.join("; ")}`); return false; }
  console.log(`BUDGET OK — wallet $${wallet0.toFixed(2)}; ${faction} today $${used.day.toFixed(2)}/${budget.per_team_daily_usd}, month $${used.month.toFixed(2)}/${budget.per_team_month_usd}`);
  if (process.env.DRYRUN) { console.log("DRYRUN — stopping before any spend."); return false; }

  // Live data: the map + the campaign countdown.
  const tiles = await fetch(`${SB}/rest/v1/tiles?select=team`, { headers: sbh }).then((r) => r.json());
  let red = 0, blue = 0;
  for (const t of tiles) t.team === "red" ? red++ : t.team === "blue" ? blue++ : null;
  const total = red + blue || 1;
  const redPct = Math.round((red / total) * 100);
  const bluePct = 100 - redPct;
  const lead = red === blue ? "dead even" : red > blue ? `Red leads by ${red - blue}` : `Blue leads by ${blue - red}`;
  const camp = await cfg("campaign");
  const daysLeft = camp?.ends_at ? Math.max(0, Math.ceil((new Date(camp.ends_at).getTime() - Date.now()) / 86_400_000)) : null;
  const orders = (await cfg("general_orders")) ?? {};
  console.log(`MAP: RED ${redPct}% / BLUE ${bluePct}% (${lead}) — ${daysLeft ?? "?"} days left — ${kind} clip, ${who.name}, look ${look.slice(0, 6)}${target ? `, for post #${target.id}` : ""}`);

  // Manual mode only (a placeholder IS the plan, so these don't apply to it):
  if (!target && !process.env.FORCE) {
    if (kind === "field" && Number(orders.recruit_pct ?? 60) >= 90) {
      console.log(`SKIP ${SIDE} field report — recruiting mix is ${orders.recruit_pct}%, field reports are paused.`);
      return false;
    }
    const since = `${today}T00:00:00Z`;
    const todays = await fetch(`${SB}/rest/v1/agent_posts?faction=eq.${faction}&format=eq.video&status=in.(queued,posted)&created_at=gte.${since}&select=id,video_spec`, { headers: sbh }).then((r) => r.json());
    if (kind === "recruit" && (todays ?? []).some((p) => p.video_spec?.kind === "recruit" && p.video_spec?.rendered_at)) {
      console.log(`SKIP ${SIDE} recruiting spot — one already went out today.`);
      return false;
    }
    if (kind === "field") {
      const last = await fetch(`${SB}/rest/v1/agent_posts?faction=eq.${faction}&video_kind=eq.social_clip&status=neq.denied&video_spec->>kind=eq.field&select=video_spec&order=created_at.desc&limit=1`, { headers: sbh }).then((r) => r.json());
      const prev = last?.[0]?.video_spec;
      if (prev && prev.red === red && prev.blue === blue) {
        console.log(`SKIP ${SIDE} — map unchanged since the last field report (RED ${red} / BLUE ${blue}).`);
        return false;
      }
    }
  }

  // The script — from this moment's data.
  const notes = (await cfg("commander_notes"))?.text ?? "";
  const HOUSE = `HOUSE RULES: Territory language only — positions, ground, fronts, compass directions ("the eastern front", "pushing up from the south"). NEVER grid coordinates, NEVER "flip"/"tiles flipping". NEVER mention spending money or prices — no dollar amounts ("first position is free" is fine; "a strike commissions you as an officer" is fine). Never invent mechanics, events, or deadlines: the game is one map, two sides, positions, strikes, barrages, first position free, a strike commissions you Second Lieutenant, and a ${daysLeft ?? 15}-day recruiting campaign. A quiet map is just a quiet map. No hashtags.${notes ? `\nCOMMANDER'S STANDING FEEDBACK (outranks everything): ${notes}` : ""}${orders.directives?.length ? `\nTHE GENERAL'S ORDERS: ${orders.directives.join(" | ")}` : ""}`;

  let sys, user;
  if (kind === "recruit") {
    sys = `You are ${who.name}, the ${SIDE} team's anchor at the ${team.network} desk on Dollar Battleground (a live territory war, Red vs Blue; site dollarbattleground.com). Composed, direct, on camera. It's a GAME — no real-world harm, no real politics.`;
    user = `Write a RECRUITING SPOT for ${Side}, delivered straight to camera. This is an ad: clear offer, real urgency, call to action. Every spot is an experiment — vary the hook and the wording; don't sound like the last one.
Ingredients (use two or three, not all): ${daysLeft != null ? `${daysLeft} days left to join ${Side}'s founding class;` : ""} pick your side; your first position is free; join as an officer — one strike commissions you Second Lieutenant; we're looking for the best; where ${Side} needs boots (a front, by direction). Map right now: ${lead} — background only, don't lead with it.
${HOUSE}
Respond ONLY JSON: {"headline":"<UPPERCASE, <=6 words, e.g. ${SIDE} IS RECRUITING · ${daysLeft ?? 15} DAYS LEFT>","spoken":"<20-28 words to camera, ending with your name and network, e.g. 'I'm ${who.name}, ${team.network}.'>","caption":"<the tweet: an ad in 2-4 short sentences with the countdown and the link dollarbattleground.com, <=200 chars>","angle":"recruit","locator":"<a front, e.g. EASTERN FRONT, or RECRUITING>"}`;
  } else {
    sys = `You are ${who.name}, the ${SIDE} team's field correspondent for Dollar Battleground (a live territory war, Red vs Blue; site dollarbattleground.com). You report from the front — urgent, present tense, pro-${faction}, playful. It's a GAME, no real-world harm.`;
    user = `Map right now: RED holds ${red} positions (${redPct}%) / BLUE ${blue} (${bluePct}%) — ${lead}. Write a short field report. You are LIVE from the field; ${who.partner} is back at the desk. NEVER use the word "anchor" or "reporter" on air — always use real names. End by tossing back to ${who.partner} BY NAME (e.g. "back to you, ${who.partner.split(" ")[0]}"). Use only the numbers above.
${HOUSE}
CAPTION rules (the tweet): ≤ 200 chars, at most one emoji, sounds like a person not a campaign. Pick the angle first: "recruit" = an invitation to a newcomer with the link dollarbattleground.com; "update"/"hype"/"taunt" = NO link at all.
Respond ONLY JSON: {"headline":"<UPPERCASE, <=6 words>","spoken":"<what you say on camera, 22-30 words, end by tossing back to ${who.partner} by name>","caption":"<the tweet>","angle":"recruit|hype|taunt|update","locator":"<a front, e.g. EASTERN FRONT or THE NORTHWEST — never coordinates>"}`;
  }

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
  let plan = {};
  for (let attempt = 0; attempt < 3 && !plan.spoken; attempt++) {
    let raw = await askClaude();
    raw = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    let p = {};
    try { p = JSON.parse(raw); } catch { continue; }
    const bad = [];
    if (!p.spoken || !p.headline || !p.caption) bad.push("missing fields");
    if (/\$\s?\d|\d+\s?(dollars?|bucks)\b/i.test(`${p.spoken} ${p.caption}`)) bad.push("mentions a price");
    if (/\bflip/i.test(`${p.spoken} ${p.caption}`)) bad.push('says "flip"');
    if (/\b\d{1,2},\d{1,2}\b/.test(`${p.spoken} ${p.caption} ${p.locator}`)) bad.push("grid coordinates");
    if (/#\w+/.test(p.caption ?? "")) bad.push("hashtag");
    if (bad.length) { console.log(`script rejected (${bad.join(", ")}) — retrying`); continue; }
    plan = p;
  }
  if (!plan.spoken) { console.log(`PLAN FAIL — no usable script for ${SIDE}; NOT spending on HeyGen.`); return false; }
  console.log("PLAN:", plan);
  if (process.env.PLAN_ONLY) { console.log("PLAN_ONLY — stopping before the render."); return false; }

  // Render the correspondent (HeyGen v3 — v1/v2 retire 2026-10-31).
  // ENGINE: avatar_iii = the talking-head look we launched with (cheapest);
  // avatar_iv = upper body + hand gestures from the same look ids (~2.5× the
  // price) — flip HEYGEN_ENGINE when the numbers justify it.
  const H = { "x-api-key": HG, "Content-Type": "application/json" };
  const body = {
    type: "avatar", avatar_id: look, script: plan.spoken, voice_id: who.voice,
    title: `${SIDE} ${kind} ${today}`, aspect_ratio: "9:16", resolution: "720p",
    background: { type: "color", value: "#0a0f1e" }, engine: { type: ENGINE },
  };
  if (ENGINE === "avatar_iv") {
    body.expressiveness = "medium";
    body.motion_prompt = kind === "recruit"
      ? "A news anchor at the desk: natural presenter hand gestures, leans in on the key line, counts on fingers when listing, steady eye contact."
      : "A field correspondent reporting from the front: points off-camera toward the action, small emphatic hand gestures, alert posture.";
  }
  const cr = await fetch("https://api.heygen.com/v3/videos", { method: "POST", headers: H, body: JSON.stringify(body) }).then((r) => r.json());
  const vid = cr.data?.video_id ?? cr.video_id;
  if (!vid) { console.log("HEYGEN FAIL:", JSON.stringify(cr)); return false; }
  console.log(`HEYGEN rendering ${vid} (${ENGINE})`);
  let url;
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 8000));
    const s = await fetch("https://api.heygen.com/v3/videos/" + vid, { headers: { "x-api-key": HG } }).then((r) => r.json());
    const d = s.data ?? s;
    if (d.status === "completed") { url = d.video_url; break; }
    if (d.status === "failed") { console.log("HEYGEN failed:", d.failure_code, d.failure_message); return false; }
  }
  if (!url) { console.log("HEYGEN timeout"); return false; }
  // HeyGen settles the wallet a little after the render; wait for it to move
  // (up to 40s) and never book $0 — the cap must always see real spend.
  let wallet1 = wallet0;
  for (let i = 0; i < 8 && wallet1 >= wallet0; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    wallet1 = await walletUsd();
  }
  let cost = Math.max(0, Number((wallet0 - wallet1).toFixed(4)));
  if (cost === 0) { cost = 0.2; console.log("wallet hasn't settled — booking the typical $0.20"); }
  await recordSpend(faction, cost);
  console.log(`SPEND — this clip $${cost.toFixed(4)}; ${faction} month now $${(used.month + cost).toFixed(2)}/${budget.per_team_month_usd}; wallet $${wallet1.toFixed(2)}`);
  await mkdir("public/_wr", { recursive: true });
  await writeFile("public/_wr/clip.mp4", Buffer.from(await (await fetch(url)).arrayBuffer()));

  // Composite the broadcast (Remotion).
  const props = {
    network: team.network, accent: team.accent, anchorSrc: "_wr/clip.mp4", reporterName: who.name,
    role: kind === "recruit" ? "anchor" : "field", headline: plan.headline, redPct, bluePct,
    locator: plan.locator || (kind === "recruit" ? "RECRUITING" : "THE CENTER"), url: "dollarbattleground.com",
    variant: kind === "recruit" ? "breaking" : "field", seconds: 12,
  };
  await writeFile("/tmp/clip-props.json", JSON.stringify(props));
  execSync("npx remotion render src/remotion/index.ts SocialClip /tmp/social-clip.mp4 --props=/tmp/clip-props.json --concurrency=1", { stdio: "inherit" });

  // Host it.
  const kkey = `clip-${faction}-${kind}-${Date.now()}.mp4`;
  await fetch(`${SB}/storage/v1/object/media/${kkey}`, { method: "POST", headers: { ...sbh, "Content-Type": "video/mp4" }, body: await readFile("/tmp/social-clip.mp4") });
  const mediaUrl = `${SB}/storage/v1/object/public/media/${kkey}`;
  console.log("HOSTED:", mediaUrl);

  const themeTag = target ? (target.reason?.match(/\[theme:\w+\]/)?.[0] ?? `[theme:${kind === "recruit" ? "countdown" : "update"}]`) : `[theme:${kind === "recruit" ? "countdown" : "update"}]`;
  const spec = { ...(target?.video_spec ?? {}), kind, red, blue, redPct, bluePct, look, who: who.name, rendered_at: new Date().toISOString(), placeholder: false };
  const reason = `${themeTag} ${kind === "recruit" ? `Recruiting spot — ${who.name} at the desk` : `Field report — ${who.name}, ${lead}`} (look ${look.slice(0, 6)}) · rendered from live data before posting`;

  if (target) {
    // Attach to the placeholder: the caption, angle and clip are all fresh.
    await fetch(`${SB}/rest/v1/agent_posts?id=eq.${target.id}`, {
      method: "PATCH",
      headers: { ...sbh, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ media_url: mediaUrl, copy: plan.caption, angle: kind === "recruit" ? "recruit" : (plan.angle || "update"), reason, video_spec: spec, last_error: null }),
    });
    console.log(`ATTACHED ${kind} clip to ${SIDE} post #${target.id}`);
  } else {
    const ap = (await cfg("autopilot")) ?? {};
    const reviewMin = Number(ap.review_minutes) || 60;
    await fetch(`${SB}/rest/v1/agent_posts`, {
      method: "POST",
      headers: { ...sbh, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        agent: `${faction}_recruiter`, faction, status: "queued", format: "video", angle: kind === "recruit" ? "recruit" : (plan.angle || "update"),
        network: faction, x_account: faction, video_kind: "social_clip", media_url: mediaUrl, copy: plan.caption, reason,
        scheduled_for: new Date(Date.now() + reviewMin * 60_000).toISOString(), video_spec: spec,
      }),
    });
    console.log(`QUEUED ${kind} clip for ${SIDE} — review it in /admin/agents`);
  }
  return true;
}

// ── entry ───────────────────────────────────────────────────────────────────
const mode = process.argv[2];
if (mode === "due") {
  // Rendering costs money: when the autopilot is OFF nothing will post, so
  // don't render placeholders either.
  const ap = (await cfg("autopilot")) ?? {};
  if (!ap.enabled && !process.env.FORCE) { console.log("Autopilot is OFF — not rendering placeholders (FORCE=1 to override)."); process.exit(0); }
  // Render every video placeholder whose slot is within the next 2 hours.
  const horizon = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
  const due = await fetch(`${SB}/rest/v1/agent_posts?format=eq.video&video_kind=eq.social_clip&status=eq.queued&media_url=is.null&scheduled_for=lte.${horizon}&select=id,faction,video_spec,reason,scheduled_for&order=scheduled_for.asc`, { headers: sbh }).then((r) => r.json());
  if (!Array.isArray(due) || due.length === 0) { console.log("Nothing due — no video placeholders in the next 2 hours."); process.exit(0); }
  const orders = (await cfg("general_orders")) ?? {};
  let made = 0;
  for (const p of due) {
    const faction = p.faction === "blue" ? "blue" : "red";
    const kind = p.video_spec?.kind === "field" ? "field" : p.video_spec?.kind === "recruit" ? "recruit" : Number(orders.recruit_pct ?? 60) >= 90 ? "recruit" : "field";
    console.log(`\n=== placeholder #${p.id} (${faction}, ${kind}, slot ${p.scheduled_for}) ===`);
    try { if (await produce({ faction, kind, target: p })) made++; } catch (e) { console.log(`placeholder #${p.id} failed:`, e?.message ?? e); }
  }
  console.log(`\nDone — ${made}/${due.length} placeholder(s) rendered.`);
} else {
  const faction = mode === "blue" ? "blue" : "red";
  const kind = process.argv[3] === "recruit" ? "recruit" : "field";
  const ok = await produce({ faction, kind });
  process.exit(ok ? 0 : 1);
}
