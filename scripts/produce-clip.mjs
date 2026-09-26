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
  // The founder — neutral, first person, the person who built it. TikTok-first.
  founder: {
    network: "BATTLEGROUND", accent: "#f2c14e",
    founder: { name: "Tim Cooley", voice: "415b2adc57fd486d95f15e97eeece48b", looks: ["f62df01471e54b9682d5e0549f9340bb", "e81fae5958714d76a1f6360cf8579e08", "03f23840beff43ff82f0fa5eddd7c27c", "d6ca071dca8d4d9c82ab402b0a3359ed", "436c18a5f66a47368f5b0a4212bf1162", "575f5ac4c15e4c0c90c7d4d3fd258e4a", "eb1899a3445d434b9c7639464595e718", "e00837ecb36a46bdacbb4e2675e42f93", "eaad76abaf35463a9e8275668cac9741", "b0f2ff81ed7449b7a79b5f3344fbe00e", "5dce0a109cf3428eacd0e774c9aaff84", "421533ae699947c2b854faffc7aa3a69"] },
  },
};

const DEF_BUDGET = { per_team_daily_usd: 0.5, per_team_month_usd: 15, wallet_floor_usd: 0.25, founder_daily_usd: 1.5, founder_month_usd: 40 };
const ENGINE = process.env.HEYGEN_ENGINE || "avatar_iii"; // see the render step
// The founder is a real person on camera — body language matters more there.
const ENGINE_FOUNDER = process.env.HEYGEN_ENGINE_FOUNDER || "avatar_iv";
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
  const founder = faction === "founder";
  const who = founder ? team.founder : kind === "recruit" ? team.anchor : team.field;
  // The founder's on-camera self can be swapped from app_config.founder_avatar
  // ({avatar_id, voice_id, engine}) — e.g. the video twin — without a deploy.
  // Several twins (different rooms, outfits, framings) rotate: founder_avatar.avatars = [{avatar_id, voice_id?}]
  let fa = faction === "founder" ? (await cfg("founder_avatar")) ?? null : null;
  if (fa?.avatars?.length) fa = { ...fa, ...fa.avatars[Math.floor(Math.random() * fa.avatars.length)] };
  if (fa?.avatar_id) { who.looks = [fa.avatar_id]; if (fa.voice_id) who.voice = fa.voice_id; }
  const look = who.looks[Math.floor(Math.random() * who.looks.length)];
  const SIDE = faction.toUpperCase();
  const Side = faction === "red" ? "Red" : faction === "blue" ? "Blue" : "Founder";

  // Wallet budget guard: per-team daily + monthly $ caps and a wallet floor.
  // Video only — text posts never touch this.
  const budget = { ...DEF_BUDGET, ...((await cfg("heygen_budget")) ?? {}) };
  const wallet0 = await walletUsd();
  const used = await spentSoFar(faction);
  const blocks = [];
  if (wallet0 <= budget.wallet_floor_usd) blocks.push(`wallet $${wallet0.toFixed(2)} at/below floor $${budget.wallet_floor_usd}`);
  const capDay = founder ? budget.founder_daily_usd : budget.per_team_daily_usd;
  const capMonth = founder ? budget.founder_month_usd : budget.per_team_month_usd;
  if (used.day >= capDay) blocks.push(`${faction} hit daily video cap $${capDay} (spent $${used.day.toFixed(2)} today)`);
  if (used.month >= capMonth) blocks.push(`${faction} hit monthly video cap $${capMonth} (spent $${used.month.toFixed(2)})`);
  if (blocks.length) { console.log(`SKIP ${SIDE} — ${blocks.join("; ")}`); return false; }
  console.log(`BUDGET OK — wallet $${wallet0.toFixed(2)}; ${faction} today $${used.day.toFixed(2)}/${capDay}, month $${used.month.toFixed(2)}/${capMonth}`);
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
  if (founder && !process.env.FORCE) {
    // "Once a day" in Tim's day (Mountain), not UTC's.
    const mtDay = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const since = new Date(Date.now() - 36 * 3600_000).toISOString();
    const recent = await fetch(`${SB}/rest/v1/agent_posts?faction=eq.founder&format=eq.video&status=in.(queued,posted)&created_at=gte.${since}&select=id,created_at`, { headers: sbh }).then((r) => r.json());
    const todayMT = mtDay(new Date());
    const dup = (recent ?? []).find((r) => mtDay(new Date(r.created_at)) === todayMT);
    if (dup) { console.log(`SKIP founder — today's (Mountain) Developer clip already exists (#${dup.id}).`); return false; }
  }
  if (!target && !founder && !process.env.FORCE) {
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
  let plan_topic = null;
  const notes = (await cfg("commander_notes"))?.text ?? "";
  const HOUSE = `HOUSE RULES: Territory language only — positions, ground, fronts, compass directions ("the eastern front", "pushing up from the south"). NEVER grid coordinates, NEVER "flip"/"tiles flipping". NEVER mention spending money or prices — no dollar amounts ("first position is free" is fine; "a strike commissions you as an officer" is fine). Never invent mechanics, events, or deadlines: the game is one map, two sides, positions, strikes, barrages, first position free, a strike commissions you Second Lieutenant, and a ${daysLeft ?? 15}-day recruiting campaign. A quiet map is just a quiet map. No hashtags.${notes ? `\nCOMMANDER'S STANDING FEEDBACK (outranks everything): ${notes}` : ""}${orders.directives?.length ? `\nTHE GENERAL'S ORDERS: ${orders.directives.join(" | ")}` : ""}`;

  // Recruits so far (the campaign's real number) — the founder talks about how it's going.
  let recruits = 0;
  try {
    const act = await fetch(`${SB}/rest/v1/activity?kind=in.(player_new,waitlist_new)&select=id`, { headers: sbh }).then((r) => r.json());
    recruits = Array.isArray(act) ? act.length : 0;
  } catch {}
  // THE DEVELOPER — the real person building it in public, outside the
  // fiction, allowed to break the fourth wall. The AI characters make the
  // theater; the Developer shows how the theater is being built. Everything
  // he references must be real: recent commits + the activity ledger.
  const DEV_THEMES = [
    "WHAT I JUST BUILT — a feature, mechanic, experiment or fix from the recent work, and why",
    "THINGS I DID NOT EXPECT — something about building this that surprised me",
    "BUILDING IN PUBLIC — why I made a choice, what I'm testing, what I'm unsure about",
    "EXPERIMENTS — ask viewers to help decide whether something is brilliant or stupid",
    "WHY I'M MAKING THIS — the idea, what I hoped it would feel like, what it actually feels like",
    "MAKING THINGS WITH AI CHARACTERS — the news desks, what they get wrong, what it's like directing them",
    "HOW HARD MARKETING IS — the business side of making a game; the real numbers, honestly",
  ];
  const DEV_OPENINGS = [
    "Okay, I need to show you what happened to the game overnight.",
    "I added one feature yesterday and immediately regretted giving it to you.",
    "Apparently I underestimated how much people hate seeing the wrong color on a screen.",
    "I need help deciding whether this feature is brilliant or completely stupid.",
    "Red, I don't know what happened today. Blue, enjoy this while it lasts.",
    "Hey guys, I've been working on this weird game and something happened today that I did not expect.",
    "When I built this, I thought people would do one thing. You are absolutely not doing that.",
  ];
  let sys, user;
  if (founder) {
    // Real material only.
    let built = [];
    try {
      built = execSync('git log --since="3 days ago" --no-merges --pretty=%s', { encoding: "utf8" })
        .split("\n").map((l) => l.trim()).filter((l) => l && !/^(Merge|chore|typo)/i.test(l)).slice(0, 8);
    } catch {}
    const since24 = new Date(Date.now() - 24 * 3600_000).toISOString();
    const act = await fetch(`${SB}/rest/v1/activity?created_at=gte.${since24}&select=kind,faction,summary,created_at&order=created_at.desc&limit=300`, { headers: sbh }).then((r) => r.json()).catch(() => []);
    const rows = Array.isArray(act) ? act : [];
    const n = (k) => rows.filter((r) => r.kind === k).length;
    const takeovers = rows.filter((r) => r.kind === "takeover");
    const byside = { red: takeovers.filter((r) => r.faction === "red").length, blue: takeovers.filter((r) => r.faction === "blue").length };
    const latest = takeovers.slice(0, 3).map((r) => r.summary).filter(Boolean);
    let reach = { videos: 0, views: 0, likes: 0 };
    try {
      const posted = await fetch(`${SB}/rest/v1/agent_posts?status=eq.posted&select=format,impressions,likes`, { headers: sbh }).then((r) => r.json());
      for (const r of posted ?? []) { if (r.format === "video") reach.videos++; reach.views += Number(r.impressions ?? 0); reach.likes += Number(r.likes ?? 0); }
    } catch {}
    const material = [
      `THE BUSINESS SIDE (true numbers): ${reach.videos} videos posted by the news desks so far, ${reach.views} views and ${reach.likes} likes on X in total; ${recruits} people have picked a side; the game is behind a countdown wall until launch; I post three videos a day (Red, Blue, me).`,
      built.length ? `BUILT RECENTLY (commit notes, translate to plain talk, never say "commit"): ${built.map((b) => `"${b.split("\n")[0]}"`).join("; ")}` : "BUILT RECENTLY: nothing new shipped in the last 3 days",
      `LAST 24 HOURS: ${n("player_new") + n("waitlist_new")} enlisted; ${takeovers.length} positions changed hands (Red took ${byside.red}, Blue took ${byside.blue})${latest.length ? `; latest: ${latest.join(" / ")}` : ""}`,
      `THE MAP NOW: RED ${redPct}% / BLUE ${bluePct}% (${lead}); ${recruits} enlisted in total; ${daysLeft != null ? `${daysLeft} days until the gates open` : "gates open date not set"}`,
    ];
    const prevRows = await fetch(`${SB}/rest/v1/agent_posts?faction=eq.founder&select=video_spec,deny_reason,status&order=created_at.desc&limit=8`, { headers: sbh }).then((r) => r.json()).catch(() => []);
    const prevTopics = (prevRows ?? []).slice(0, 4);
    const used = new Set((prevTopics ?? []).map((p) => p.video_spec?.topic).filter(Boolean));
    // Tim's standing notes for the Developer (app_config.developer_notes) + his notes on past clips (deny reasons).
    const standing = (await cfg("developer_notes"))?.text ?? "";
    // Tim's own notes on past Developer clips (deny reasons) — the only feedback that applies here.
    const devNotes = (prevRows ?? []).filter((r) => r.status === "denied" && r.deny_reason && !/superseded/i.test(r.deny_reason)).map((r) => r.deny_reason).slice(0, 5);
    const freshT = DEV_THEMES.filter((t) => !used.has(t));
    const pool = freshT.length ? freshT : DEV_THEMES;
    const topic = pool[Math.floor(Math.random() * pool.length)];
    plan_topic = topic;
    sys = `You are THE DEVELOPER: Tim Cooley, the real person MAKING Dollar Battleground (a live territory war, Red vs Blue, one map, one side wins). You are OUTSIDE the fiction and can break the fourth wall — the Red/Blue commanders, field reporters and news desks are characters you built; you're the one building the stage.
WHO YOU ARE ON CAMERA: a producer whose game isn't working yet, and who's honest about that. Slightly unsure, curious, a little amused, warm — a slight smile, not a grin. Not a salesman, not a commander, not a spokesperson. You know it's a strange little internet war and you find it funny that anyone (including you) cares this much.
THE ONE RULE ABOVE ALL: every clip makes it obvious that YOU MADE THIS. In the first sentence or two you say some version of "I've been working on this game" / "so I'm making this game where…" / "I built…". A stranger scrolling past must know within five seconds that this is the person building it — otherwise you're just another anchor, and that reads fake.
YOUR SUBJECT IS THE MAKING, NEVER THE MATCH: what you built, what broke, what surprised you, what you're testing, why you're doing this, what it's like directing AI characters that go off-script, how hard the marketing and business side is. The map/score is at most a one-line aside ("board's still dead even, by the way") — never the topic. You never commentate the war; that's the news desks' job.
VOICE: talk like a real person to your own phone. Not scripted, not corporate, no announcer language, no CEO energy. Contractions, short sentences, an aside is fine. Honest about small numbers — that's charming, not weak.
ENDING: end like a person ends a thought. Sometimes — not every clip — close with a genuine invitation like "I've been working on this, I'd love for you to check it out" or "what color would you pick?" — an invitation from the maker, never a pitch.
HARD RULES: never invent statistics, events or features — only the real material you're given. NEVER mention money, buying, prices, spending, revenue, "$", "a dollar", "cheap", "free". No "join", "enlist", "sign up", "claim your", "founding class", "days left to…", "don't miss". Don't say the site's name (it's on screen). No hashtags in what you say. It's a game; no real politics.`;
    user = `Today's theme: ${topic}.
REAL MATERIAL (the only facts you may use):
- ${material.join("\n- ")}
Openings you can riff on (don't copy one verbatim every time): ${DEV_OPENINGS.map((o) => `"${o}"`).join(" | ")}
Write today's clip to camera: 35-55 words, ONE thought, and it must be clear in the first two sentences that you are the person making this game. Sound like you're actually talking — contractions, short sentences, an aside is fine, no headline-speak, no "welcome to". The map and the countdown are passing context at most, never the subject. Finish the thought inside the time; don't start a second one. The "headline" field is unused for you — keep it short.${standing ? `\nTIM'S STANDING NOTES (outrank everything): ${standing}` : ""}${devNotes.length ? `\nTIM'S NOTES ON YOUR LAST CLIPS (fix these): ${devNotes.map((n) => `"${n}"`).join(" | ")}` : ""}
THE GOLD STANDARD (Tim's words: "this is gold — stuff like this makes ME interesting"): "Okay, weird thing about building a game with AI news anchors. They lie. Not on purpose — they just… invent stuff. One of them made up a 24-hour freeze rule that doesn't exist." — a builder telling on his own robots: specific, true, a little amused, no pitch. Aim for that.
Respond ONLY JSON: {"headline":"<short, unused>","spoken":"<what you say>","caption":"<the TikTok caption as a person would write it: one or two casual lines, lowercase is fine, no pitch, no site name (it's on screen); 0-3 hashtags at most; <=200 chars>","angle":"founder","locator":"DEV LOG"}`;
  } else if (kind === "recruit") {
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
    if (founder) {
      // The Developer only owes the spoken line; the rest has sane defaults.
      if (!p.headline) p.headline = "DEV LOG";
      if (!p.caption && p.spoken) p.caption = p.spoken.split(/(?<=[.!?])\s/)[0].slice(0, 140).toLowerCase();
      if (!p.locator) p.locator = "DEV LOG";
      p.angle = "founder";
    }
    if (!p.spoken || !p.headline || !p.caption) bad.push(`missing fields (${Object.keys(p).join(",") || "none"})`);
    if (/\$\s?\d|\d+\s?(dollars?|bucks)\b/i.test(`${p.spoken} ${p.caption}`)) bad.push("mentions a price");
    if (/\bflip/i.test(`${p.spoken} ${p.caption}`)) bad.push('says "flip"');
    if (founder && /\b(buy|bought|purchase|pay|paid|price|cost|spend|spent|revenue|cheap|dollars?|money|free)\b/i.test(`${p.spoken} ${p.caption}`)) bad.push("developer mentions money");
    if (founder && /founding class|\benlist|\brecruit|sign up|claim your|don'?t miss|last chance|wanna be the one|join (red|blue|us|now|the)|days left to|dollarbattleground\.com/i.test(`${p.spoken} ${p.caption}`)) bad.push("developer sounds like an ad");
    if (founder && ((p.spoken ?? "").match(/check it out|link'?s? in (the )?bio|hope you enjoy|what color|which side would you/gi) ?? []).length > 1) bad.push("more than one nod");
    if (founder && !/\b(I'?ve been (working on|making|building)|I'?m (working on|making|building)|I (built|made|make)|(my|this) game (I|that I)|been building|been making)\b/i.test(p.spoken ?? "")) bad.push("never says he's making the game");
    if (founder && /(\d+\s?%|percent|up by|dead even|tied|fifty[- ]fifty|leads? by|nobody('s| has) moved)/i.test(p.spoken ?? "") && !/(built|building|making|made|wrote|coded|fixed|shipped)/i.test(p.spoken ?? "")) bad.push("commentates the score");
    if (/\b\d{1,2},\d{1,2}\b/.test(`${p.spoken} ${p.caption} ${p.locator}`)) bad.push("grid coordinates");
    if (!founder && /#\w+/.test(p.caption ?? "")) bad.push("hashtag"); // X rule; TikTok captions want them
    if (founder && /#\w+/.test(p.spoken ?? "")) bad.push("hashtag spoken aloud");
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
    background: { type: "color", value: "#0a0f1e" }, engine: { type: founder ? (fa?.engine || ENGINE_FOUNDER) : ENGINE },
  };
  if (fa?.engine === "none") delete body.engine; // let HeyGen pick for a video twin
  if (founder) body.resolution = "1080p";
  if (body.engine?.type === "avatar_iv") {
    // low = calmer mouth (less teeth) — Tim found medium a bit toothy.
    body.expressiveness = founder ? (process.env.HEYGEN_EXPRESSIVENESS_FOUNDER || "low") : "medium";
    body.motion_prompt = founder
      ? "A person talking to his own phone, not to an audience: a slight, warm smile as his resting face — never a grin, mouth mostly relaxed. Slightly unsure; glances away while thinking, looks down now and then, comes back to the lens. Small hand movements, small nods, no big gestures, no leaning in."
      : kind === "recruit"
        ? "A news anchor at the desk: natural presenter hand gestures, leans in on the key line, counts on fingers when listing, steady eye contact."
        : "A field correspondent reporting from the front: points off-camera toward the action, small emphatic hand gestures, alert posture.";
  }
  const cr = await fetch("https://api.heygen.com/v3/videos", { method: "POST", headers: H, body: JSON.stringify(body) }).then((r) => r.json());
  const vid = cr.data?.video_id ?? cr.video_id;
  if (!vid) { console.log("HEYGEN FAIL:", JSON.stringify(cr)); return false; }
  console.log(`HEYGEN rendering ${vid} (${body.engine?.type ?? "default"}${fa?.avatar_id ? ", twin" : ""})`);
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
  console.log(`SPEND — this clip $${cost.toFixed(4)}; ${faction} month now $${(used.month + cost).toFixed(2)}/${capMonth}; wallet $${wallet1.toFixed(2)}`);
  await mkdir("public/_wr", { recursive: true });
  await writeFile("public/_wr/clip.mp4", Buffer.from(await (await fetch(url)).arrayBuffer()));

  // Composite the broadcast (Remotion) — sized to the actual clip so nothing
  // gets cut off (the Developer talks longer than the anchors).
  // …and trimmed to the end of speech: HeyGen pads the clip with idle seconds
  // after the last word, and a feed loops it, so it looks like a restart.
  let clipSeconds = 12;
  try {
    const d = parseFloat(execSync("ffprobe -v error -show_entries format=duration -of csv=p=0 public/_wr/clip.mp4", { encoding: "utf8" }).trim());
    let end = d;
    try {
      const det = execSync("ffmpeg -v info -i public/_wr/clip.mp4 -af silencedetect=n=-35dB:d=0.6 -f null - 2>&1", { encoding: "utf8" });
      const starts = [...det.matchAll(/silence_start: ([\d.]+)/g)].map((m) => parseFloat(m[1]));
      const ends = [...det.matchAll(/silence_end: ([\d.]+)/g)].map((m) => parseFloat(m[1]));
      // trailing silence = a start with no end after it (or an end at the file's end)
      const lastStart = starts[starts.length - 1];
      const trailing = lastStart != null && (ends.length < starts.length || d - ends[ends.length - 1] < 0.2);
      if (trailing && d - lastStart > 1) end = lastStart;
    } catch {}
    if (d > 0) clipSeconds = Math.min(60, Math.max(4, Math.round((end + 0.7) * 10) / 10));
    // Cut the source itself so a frozen tail can never reach the composite.
    if (end < d - 0.5) {
      execSync(`ffmpeg -v error -y -i public/_wr/clip.mp4 -t ${clipSeconds} -c:v libx264 -preset veryfast -crf 18 -c:a aac -movflags +faststart public/_wr/clip-cut.mp4`, { stdio: "inherit" });
      execSync("mv public/_wr/clip-cut.mp4 public/_wr/clip.mp4");
    }
    console.log(`CLIP ${d.toFixed(1)}s, speech ends ~${end.toFixed(1)}s → composite ${clipSeconds}s`);
  } catch (e) {
    clipSeconds = Math.min(60, Math.ceil(plan.spoken.split(/\s+/).length / 2.4) + 1);
    console.log(`TRIM FAILED (${e?.message?.split("\n")[0] ?? e}) — falling back to ${clipSeconds}s from the word count`);
  }
  const props = {
    network: team.network, accent: team.accent, anchorSrc: "_wr/clip.mp4", reporterName: who.name,
    role: founder ? "founder" : kind === "recruit" ? "anchor" : "field", headline: plan.headline, redPct, bluePct,
    locator: plan.locator || (founder ? "DEV LOG" : kind === "recruit" ? "RECRUITING" : "THE CENTER"), url: "dollarbattleground.com",
    variant: founder ? "plain" : kind === "recruit" ? "breaking" : "field", seconds: clipSeconds,
  };
  await writeFile("/tmp/clip-props.json", JSON.stringify(props));
  execSync("npx remotion render src/remotion/index.ts SocialClip /tmp/social-clip.mp4 --props=/tmp/clip-props.json --concurrency=1", { stdio: "inherit" });

  // Host it.
  const kkey = `clip-${faction}-${kind}-${Date.now()}.mp4`;
  await fetch(`${SB}/storage/v1/object/media/${kkey}`, { method: "POST", headers: { ...sbh, "Content-Type": "video/mp4" }, body: await readFile("/tmp/social-clip.mp4") });
  const mediaUrl = `${SB}/storage/v1/object/public/media/${kkey}`;
  console.log("HOSTED:", mediaUrl);

  const themeTag = target ? (target.reason?.match(/\[theme:\w+\]/)?.[0] ?? `[theme:${kind === "recruit" ? "countdown" : "update"}]`) : `[theme:${kind === "recruit" ? "countdown" : "update"}]`;
  const spec = { ...(target?.video_spec ?? {}), kind, red, blue, redPct, bluePct, look, who: who.name, rendered_at: new Date().toISOString(), placeholder: false, ...(plan_topic ? { topic: plan_topic } : {}) };
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
      body: JSON.stringify(founder ? {
        agent: "founder", faction: "founder", status: "queued", format: "video", angle: "founder",
        network: "tiktok", x_account: null, video_kind: "social_clip", media_url: mediaUrl, copy: plan.caption,
        reason: `[theme:developer] The Developer — ${plan_topic.split(" — ")[0]} (look ${look.slice(0, 6)})`,
        scheduled_for: new Date(Date.now() + reviewMin * 60_000).toISOString(), video_spec: spec,
      } : {
        agent: `${faction}_recruiter`, faction, status: "queued", format: "video", angle: kind === "recruit" ? "recruit" : (plan.angle || "update"),
        network: faction, x_account: faction, video_kind: "social_clip", media_url: mediaUrl, copy: plan.caption, reason,
        scheduled_for: new Date(Date.now() + reviewMin * 60_000).toISOString(), video_spec: spec,
      }),
    });
    console.log(`QUEUED ${founder ? "founder" : kind} clip for ${SIDE} — review it in /admin/agents`);
  }
  return true;
}

// ── entry ───────────────────────────────────────────────────────────────────
const mode = process.argv[2];
if (mode === "cast") {
  // Print the HeyGen roster (photo-avatar groups, their looks, custom voices)
  // so new correspondents can be wired into CAST without touching the console.
  const H = { "x-api-key": HG };
  const groups = await fetch("https://api.heygen.com/v2/avatar_group.list?include_public=false", { headers: H }).then((r) => r.json());
  for (const g of groups.data?.avatar_group_list ?? []) {
    console.log(`GROUP ${g.name} (${g.group_type}, ${g.num_looks} looks, ${g.train_status ?? "-"}) id=${g.id}`);
    const looks = await fetch(`https://api.heygen.com/v2/avatar_group/${g.id}/avatars`, { headers: H }).then((r) => r.json());
    for (const l of looks.data?.avatar_list ?? []) console.log(`   LOOK ${l.name ?? "-"} id=${l.id} status=${l.status ?? "-"}`);
  }
  // Video avatars (digital twins) live in the avatar list, not the photo groups.
  const av = await fetch("https://api.heygen.com/v2/avatars", { headers: H }).then((r) => r.json());
  for (const a of (av.data?.avatars ?? []).filter((a) => /tim|cooley/i.test(a.avatar_name ?? ""))) {
    console.log(`AVATAR ${a.avatar_name} id=${a.avatar_id} gender=${a.gender ?? "-"} premium=${a.premium ?? "-"} type=${a.type ?? "-"} status=${a.status ?? "-"}`);
  }
  const voices = await fetch("https://api.heygen.com/v2/voices", { headers: H }).then((r) => r.json());
  const all = voices.data?.voices ?? [];
  const mine = all.filter((v) => /tim|cooley|clone|custom|my /i.test(`${v.name} ${v.tags ?? ""}`));
  console.log(`VOICES total=${all.length}; likely custom:`);
  for (const v of mine.slice(0, 30)) console.log(`   VOICE ${v.name} id=${v.voice_id} lang=${v.language} gender=${v.gender}`);
  process.exit(0);
}
if (mode === "due") {
  // Rendering costs money: when the autopilot is OFF nothing will post, so
  // don't render placeholders either.
  const ap = (await cfg("autopilot")) ?? {};
  if (!ap.enabled && !process.env.FORCE) { console.log("Autopilot is OFF — not rendering placeholders (FORCE=1 to override)."); process.exit(0); }
  // Render every video placeholder whose slot is within the next 6 hours —
  // GitHub's cron fires every 5-6 hours in practice, so 2 hours missed slots.
  const horizon = new Date(Date.now() + 6 * 60 * 60_000).toISOString();
  const due = await fetch(`${SB}/rest/v1/agent_posts?format=eq.video&video_kind=eq.social_clip&status=eq.queued&media_url=is.null&scheduled_for=lte.${horizon}&select=id,faction,video_spec,reason,scheduled_for&order=scheduled_for.asc`, { headers: sbh }).then((r) => r.json());
  const list = Array.isArray(due) ? due : [];
  if (list.length === 0) console.log("Nothing due — no video placeholders in the next 6 hours.");
  const orders = (await cfg("general_orders")) ?? {};
  let made = 0;
  for (const p of list) {
    const faction = p.faction === "blue" ? "blue" : "red";
    const kind = p.video_spec?.kind === "field" ? "field" : p.video_spec?.kind === "recruit" ? "recruit" : Number(orders.recruit_pct ?? 60) >= 90 ? "recruit" : "field";
    console.log(`\n=== placeholder #${p.id} (${faction}, ${kind}, slot ${p.scheduled_for}) ===`);
    try { if (await produce({ faction, kind, target: p })) made++; } catch (e) { console.log(`placeholder #${p.id} failed:`, e?.message ?? e); }
  }
  if (list.length) console.log(`\nDone — ${made}/${list.length} placeholder(s) rendered.`);
  // The founder's daily clip: once a day, after 16:00 UTC (10am Mountain),
  // when today's doesn't exist yet. Reviewed on /admin/agents like the rest.
  if (new Date().getUTCHours() >= 16) {
    try { await produce({ faction: "founder", kind: "founder" }); } catch (e) { console.log("founder clip failed:", e?.message ?? e); }
  }
} else if (mode === "founder") {
  await produce({ faction: "founder", kind: "founder" });
} else {
  const faction = mode === "blue" ? "blue" : "red";
  const kind = process.argv[3] === "recruit" ? "recruit" : "field";
  const ok = await produce({ faction, kind });
  process.exit(ok ? 0 : 1);
}
