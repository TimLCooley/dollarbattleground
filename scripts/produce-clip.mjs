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
//
// TEAM TIM (app_config.team_avatar): when a side has a photo-avatar group
// configured there, that side's clips are fronted by Tim himself — the
// Developer, recruiting for that colour in his own voice — instead of the
// news cast. The pitch is the officer commissions: `commissions` per side
// (default 100), and how many are still open, counted live.
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

// Every correspondent has several looks. Each run takes the one used longest
// ago (see pickFresh), so nobody wears the same look twice in a row and every
// look gets a turn before any repeats.
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
    founder: { name: "Tim Cooley", voice: "2c58da09c9ec4d4cbbc006a7a3298e57", looks: ["bd2c9c12984844a8b3776d39d3049c97", "22d5799e480144a1b0d0fab898e28a88", "571ac427f9f649009b22a2ef72fb74a8", "00e9cdbf757e4d84a5281f533bdd9c9f", "86d75809e34644039ebc0ed36b7b4ab5", "857aff106c594ece8d4462934aebc589", "8c60a083618b434dbe3b69be4262cbc4"] },
  },
};

const DEF_BUDGET = { per_team_daily_usd: 0.5, per_team_month_usd: 15, wallet_floor_usd: 0.25, founder_daily_usd: 1.5, founder_month_usd: 40, tim_team_daily_usd: 2, tim_team_month_usd: 40 };
const ENGINE = process.env.HEYGEN_ENGINE || "avatar_iii"; // see the render step
// The founder is a real person on camera — body language matters more there.
const ENGINE_FOUNDER = process.env.HEYGEN_ENGINE_FOUNDER || "avatar_iv";
const today = new Date().toISOString().slice(0, 10);
const monthStart = today.slice(0, 8) + "01";

// Rotation: pick from `pool` the entry used longest ago. `recent` is what was
// used before, most recent first (from the posts' video_spec). Entries never
// used come first; ties break at random. With 2+ entries the last one used is
// never picked again, and every entry is used once before any comes back.
function pickFresh(pool, recent) {
  if (pool.length <= 1) return pool[0];
  const lastUse = new Map(pool.map((id) => [id, Infinity]));
  recent.forEach((id, i) => { if (lastUse.get(id) === Infinity) lastUse.set(id, i); });
  const oldest = Math.max(...pool.map((id) => lastUse.get(id)));
  const cands = pool.filter((id) => lastUse.get(id) === oldest);
  return cands[Math.floor(Math.random() * cands.length)];
}
// The specs of this character's recent clips, newest first (look, bg, ...).
async function recentSpecs(faction, name) {
  try {
    const rows = await fetch(`${SB}/rest/v1/agent_posts?faction=eq.${faction}&format=eq.video&video_spec->>who=eq.${encodeURIComponent(name)}&select=video_spec&order=created_at.desc&limit=50`, { headers: sbh }).then((r) => r.json());
    return (Array.isArray(rows) ? rows : []).map((r) => r.video_spec).filter((v) => v && !v.placeholder);
  } catch (e) { console.log("could not read recent clips for the rotation — picking at random:", e?.message ?? e); return []; }
}

async function cfg(key) {
  const rows = await fetch(`${SB}/rest/v1/app_config?key=eq.${key}&select=value`, { headers: sbh }).then((r) => r.json());
  try { return JSON.parse(rows?.[0]?.value ?? "null"); } catch { return null; }
}
async function cfgSet(key, value) {
  await fetch(`${SB}/rest/v1/app_config`, {
    method: "POST",
    headers: { ...sbh, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() }),
  });
}
// Officers on a side: anyone there who has spent at least a strike's worth
// (a strike commissions you Second Lieutenant). The real number behind
// "N commissions still open".
async function officersOn(faction) {
  // Founding Officers (first 100 signups) or paid commissions — the server counts.
  try {
    const r = await fetch(`${SB}/rest/v1/rpc/officers_on`, { method: "POST", headers: { ...sbh, "Content-Type": "application/json" }, body: JSON.stringify({ p_side: faction }) });
    const n = await r.json();
    if (r.ok && Number.isFinite(Number(n))) return Number(n);
  } catch {}
  try {
    const rows = await fetch(`${SB}/rest/v1/player_stats?side=eq.${faction}&spent_cents=gte.500&select=user_id`, { headers: sbh }).then((r) => r.json());
    return Array.isArray(rows) ? rows.length : 0;
  } catch { return 0; }
}
// A photo-avatar group's looks, read live so deleting a bad one in the HeyGen
// app drops it from the rotation without a deploy. Real photos (the ones Tim
// named) animate as Tim's actual face — the HeyGen-generated stills ("Photo
// Avatar") gave him a stranger's chin — so those win when there are enough.
async function liveLooks(groupId, exclude = []) {
  const gl = await fetch(`https://api.heygen.com/v2/avatar_group/${groupId}/avatars`, { headers: { "x-api-key": HG } }).then((r) => r.json());
  const all = (gl.data?.avatar_list ?? []).filter((l) => l.id && l.id !== groupId && (l.status ?? "completed") === "completed" && !exclude.includes(l.id));
  const real = all.filter((l) => l.name && !/^photo avatar$/i.test(l.name.trim()));
  const ids = (real.length >= 3 ? real : all).map((l) => l.id);
  console.log(`LOOKS ${ids.length} live from group ${groupId.slice(0, 6)} (${real.length} real photos, ${all.length} total)`);
  return ids;
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
  let who = founder ? team.founder : kind === "recruit" ? team.anchor : team.field;
  // TEAM TIM: a side whose photo-avatar group is set in app_config.team_avatar
  // is fronted by Tim — the Developer, recruiting for that colour — in his
  // own voice. {on, voice_id, engine, resolution, commissions,
  //  red: {group_id, exclude_looks, backgrounds}, blue: {...}}
  const ta = founder ? null : (await cfg("team_avatar")) ?? null;
  const tim = !!(ta && ta.on !== false && ta[faction]?.group_id);
  // The founder's on-camera self can be swapped from app_config.founder_avatar
  // ({avatar_id, voice_id, engine}) — e.g. the video twin — without a deploy.
  // Several twins (different rooms, outfits, framings) rotate: founder_avatar.avatars = [{avatar_id, voice_id?}]
  let fa = founder ? (await cfg("founder_avatar")) ?? null : null;
  if (tim) {
    // Same shape the founder path reads (engine, backgrounds, voice).
    fa = { ...ta[faction], voice_id: ta.voice_id || CAST.founder.founder.voice, engine: ta.engine || ENGINE_FOUNDER, resolution: ta.resolution || "720p" };
    who = { name: "Tim Cooley", voice: fa.voice_id, looks: [...CAST.founder.founder.looks] };
    try {
      const ids = await liveLooks(fa.group_id, fa.exclude_looks ?? []);
      if (ids.length) who.looks = ids;
    } catch (e) { console.log("could not read the team group's looks — using the Developer's built-in list:", e?.message ?? e); }
    console.log(`TEAM TIM — the Developer fronts ${faction.toUpperCase()}'s ${kind} clip`);
  }
  const twins = fa?.avatars?.filter((a) => a?.avatar_id) ?? [];
  if (tim) { /* looks already loaded */ }
  else if (twins.length) who.looks = twins.map((a) => a.avatar_id);
  else if (fa?.avatar_id) { who.looks = [fa.avatar_id]; if (fa.voice_id) who.voice = fa.voice_id; }
  else if (fa?.group_id) {
    try {
      const ids = await liveLooks(fa.group_id, fa.exclude_looks ?? []);
      if (ids.length) who.looks = ids;
      if (fa.voice_id) who.voice = fa.voice_id;
    } catch (e) { console.log("could not read the group's looks — using the built-in list:", e?.message ?? e); }
  }
  // The look used longest ago — the previous clips' specs remember which one
  // each wore, so the same face never shows up twice running.
  const prevSpecs = await recentSpecs(faction, who.name);
  const look = pickFresh(who.looks, prevSpecs.map((v) => v.look).filter(Boolean));
  if (twins.length) { fa = { ...fa, ...twins.find((a) => a.avatar_id === look) }; if (fa.voice_id) who.voice = fa.voice_id; }
  const SIDE = faction.toUpperCase();
  const Side = faction === "red" ? "Red" : faction === "blue" ? "Blue" : "Founder";

  // Wallet budget guard: per-team daily + monthly $ caps and a wallet floor.
  // Video only — text posts never touch this.
  const budget = { ...DEF_BUDGET, ...((await cfg("heygen_budget")) ?? {}) };
  const wallet0 = await walletUsd();
  const used = await spentSoFar(faction);
  const blocks = [];
  if (wallet0 <= budget.wallet_floor_usd) blocks.push(`wallet $${wallet0.toFixed(2)} at/below floor $${budget.wallet_floor_usd}`);
  // Tim on the gesture engine costs ~3× an anchor, so a side he fronts gets its own caps.
  const capDay = founder ? budget.founder_daily_usd : tim ? budget.tim_team_daily_usd : budget.per_team_daily_usd;
  const capMonth = founder ? budget.founder_month_usd : tim ? budget.tim_team_month_usd : budget.per_team_month_usd;
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
  // Officer commissions per side — the Developer's pitch when he fronts a team.
  const commissionsOpen = Number(ta?.commissions ?? 100); // "looking for 100 officers"
  const filled = Number(ta?.filled ?? 0); // spots counted as taken before the ledger started
  const officers = tim ? await officersOn(faction) : 0;
  const commissionsLeft = Math.max(0, commissionsOpen - filled - officers);
  const enemyLeft = tim ? Math.max(0, commissionsOpen - filled - (await officersOn(faction === "red" ? "blue" : "red"))) : 0;
  // VOICE GUIDES (app_config.voices.<character>.text + .notes[]): the feel of
  // each character in Tim's own words. Outranks everything in the prompt below;
  // the judge (further down) grades every draft against it. Edit in the
  // database, no deploy.
  const voices = (await cfg("voices")) ?? {};
  const voiceKey = tim ? "team_tim" : founder ? "developer" : kind === "recruit" ? "anchor" : "field";
  const guide = voices[voiceKey] ?? {};
  const guideText = [guide.text, ...((guide.notes ?? []).map((n) => `• ${n}`))].filter(Boolean).join("\n");
  // Tim's deny notes on this character's recent clips join the guide automatically.
  let denyNotes = [];
  try {
    const q = tim ? `faction=eq.${faction}&format=eq.video&reason=ilike.*Tim Cooley*` : founder ? `faction=eq.founder` : `faction=eq.${faction}&format=eq.video&reason=not.ilike.*Tim Cooley*`;
    const rows = await fetch(`${SB}/rest/v1/agent_posts?${q}&status=eq.denied&select=deny_reason&order=created_at.desc&limit=5`, { headers: sbh }).then((r) => r.json());
    denyNotes = (rows ?? []).map((r) => r.deny_reason).filter((d) => d && !/superseded/i.test(d));
  } catch {}
  // A time-boxed mood on top of the guide — e.g. the launch window: "the
  // battle has begun" until the date passes or the founding spots are gone.
  const mood = voices.launch ?? null;
  // On for the window (until) — and past it, as long as founding spots remain.
  const moodOn = !!mood?.text && ((!!mood.until && new Date(mood.until).getTime() > Date.now()) || (!!mood.while_founding_open && (tim ? commissionsLeft > 0 : true)));
  const MOOD = moodOn && !founder ? `RIGHT NOW (this week's mood, on top of everything else): ${mood.text}\n` : moodOn && founder && mood.developer ? `RIGHT NOW: ${mood.developer}\n` : "";
  const GUIDE = guideText || denyNotes.length || MOOD ? `${MOOD}VOICE GUIDE — Tim's own words on how this character should feel (outranks every rule below):\n${guideText}${denyNotes.length ? `\nTim's notes on recent clips (fix these): ${denyNotes.map((d) => `"${d}"`).join(" | ")}` : ""}` : "";
  let sys, user;
  if (tim) {
    // THE DEVELOPER, RECRUITING FOR A SIDE. Still Tim — the person who built
    // it, talking to his phone — but today he has picked a colour and he's
    // filling that side's officer corps. The house rules still hold (no
    // prices); the numbers are real.
    const Enemy = faction === "red" ? "Blue" : "Red";
    const full = commissionsLeft === 0;
    // Tim fronting a side is a RECRUITER for that colour: same world as the
    // reporters (partisan, territory language, lively) but talking, not
    // anchoring — and never the producer. No countdown, no founding class.
    const HOUSE_TIM = `HOUSE RULES: Territory language only — positions, ground, fronts, compass directions ("the eastern front", "pushing up from the south"). NEVER grid coordinates, NEVER "flip"/"tiles flipping". NEVER mention spending money or prices — no dollar amounts ("your first position is free" is fine; "one strike commissions you Second Lieutenant" is fine). Never invent mechanics, events or deadlines: the game is one map, two sides, positions, strikes, barrages, first position free, a strike commissions you Second Lieutenant. A quiet map is just a quiet map. No hashtags.`;
    sys = `${GUIDE}\nYou are Tim, ${SIDE}'s recruiter on Dollar Battleground (a live territory war, Red vs Blue, one map, one side wins). You've picked ${Side} and you want the best people on it. It's a GAME — no real politics, no real-world harm.
WHO YOU ARE ON CAMERA: one of ${Side}'s own, talking to your phone — not a news anchor, not the game's producer, not a salesman. Partisan for ${Side} the way the ${SIDE} news desk is, but conversational: contractions, short sentences, a little swagger, a slight smile. You never mention building or making the game, never say "I built" / "I made" / "I'm running" / "developer" — you're just on ${Side}.
NOT REPORTERY: no "reporting live", no "this just in", no "back to you", no sign-off with a name or a network, no reading the score like a broadcast. You talk the way a person talks when they're recruiting friends for their team.
SOUND NORMAL. Openers Tim actually says — start like one of these, in your own words: "Quick ${Side} update." / "Quick ${Side} check-in." / "Here's a ${Side} status update." / "Big movement today by ${Side} — you should join." / "${Side} needs people on the north side. That's it, that's the update." Plain words, short sentences, no slogans, no announcer rhythm. If a line would sound weird said out loud to a friend, cut it.
NO COUNTDOWN: never mention days left, a deadline, a last day, a campaign, or a "founding class". Anyone can join any time — the map is open.
THE SHAPE OF EVERY CLIP — "here's how ${Side} is doing… come play": (1) how ${Side} is doing right now, as a subtle clue of what's happening on the map — the lead, where the fight is, which front needs boots — territory language, a sentence or two, never a scoreboard read; (2) the invitation, as an action: "claim your territory", "flip a ${Enemy} territory", "take a position", "come play"; (3) the officers line when it fits.
THE PITCH (real, use it): the first ${commissionsOpen} people to sign up are commissioned as officers on the spot — no strike needed, just claim your first position. ${Side} is looking for ${commissionsOpen} officers. ${full ? `${Side}'s spots are all taken — point people at taking a position on ${Side} anyway, or at ${Enemy}, which has ${enemyLeft} open.` : `${commissionsLeft} spots are still open${enemyLeft !== commissionsLeft ? ` (${Enemy} has ${enemyLeft})` : ""}.`} Your first position is free. One strike commissions you Second Lieutenant. Mention the officer spots in passing when it fits — "${commissionsLeft} founding officer spots still open", "the first ${commissionsOpen} to sign up get commissioned" — one number is plenty; never recite both like a form.
${HOUSE_TIM}
Don't say the site's name (it's on screen).`;
    // Two clips a day: the first is the status update, the second a direct ad —
    // different shapes, so the numbers can tell us which one recruits.
    let adToday = false;
    try {
      const since = `${today}T00:00:00Z`;
      const prior = await fetch(`${SB}/rest/v1/agent_posts?faction=eq.${faction}&format=eq.video&status=in.(queued,posted)&created_at=gte.${since}&reason=ilike.*Tim Cooley*&select=id`, { headers: sbh }).then((r) => r.json());
      adToday = Array.isArray(prior) && prior.length >= 1;
    } catch {}
    plan_topic = adToday ? "direct ad" : "status update";
    user = kind === "recruit" && adToday
      ? `Write today's DIRECT AD for ${SIDE}: 25-40 words, straight to camera. This one is the plain invitation — say the game's name (Dollar Battleground), what you do (claim a tile / pick a color / hold it), and ask them onto ${Side} straight, with feeling ("Join the ${Side} team — I need you"). Change the ORDER from the usual: lead with the side, or the action, or the stakes, or put the name last. Mention the officer spots once if it fits. No countdown. End on the side pick.
Map right now: ${lead} — a passing aside at most.
Respond ONLY JSON: {"headline":"<UPPERCASE, <=6 words>","spoken":"<what you say>","caption":"<the tweet from the ${SIDE} account: the ad in 2-3 short sentences as a person would write them, the link dollarbattleground.com; <=200 chars; no hashtags>","angle":"recruit","locator":"RECRUITING FOR ${SIDE}"}`
      : kind === "recruit"
      ? `Write today's clip for ${SIDE}: 25-40 words, straight to camera, in the shape "here's how ${Side} is doing… come play". Open like a normal person giving a quick update (see the openers), one subtle clue from the map below, then the invitation as an action (claim your territory / flip a ${Enemy} territory / take a position / come play), with the officer spots mentioned once if it fits. End like a person ends a thought, not an ad read. Vary the opener and the action from clip to clip.
Map right now: RED holds ${red} positions (${redPct}%) / BLUE ${blue} (${bluePct}%) — ${lead}.
Respond ONLY JSON: {"headline":"<UPPERCASE, <=6 words, e.g. ${SIDE} WANTS ${commissionsOpen} OFFICERS · ${commissionsLeft} OPEN>","spoken":"<what you say>","caption":"<the tweet from the ${SIDE} account, 2-3 short sentences as a person would write them: looking for ${commissionsOpen} officers, ${commissionsLeft} open, the link dollarbattleground.com; <=200 chars; no hashtags>","angle":"recruit","locator":"RECRUITING FOR ${SIDE}"}`
      : `Write today's clip for ${SIDE}: 30-45 words, ONE thought, about the map as ${Side} sees it — RED holds ${red} positions (${redPct}%) / BLUE ${blue} (${bluePct}%), ${lead} — where ${Side} needs boots (a front, by direction), territory language only, talking not anchoring. Work the open-spots number (${commissionsLeft} of ${commissionsOpen}) in once; end like a person ends a thought.
Respond ONLY JSON: {"headline":"<UPPERCASE, <=6 words>","spoken":"<what you say>","caption":"<the tweet from the ${SIDE} account, <=200 chars, sounds like a person, the link dollarbattleground.com only if it's an invitation; no hashtags>","angle":"recruit|update|hype","locator":"<a front, e.g. EASTERN FRONT — never coordinates>"}`;
  } else if (founder) {
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
    sys = `${GUIDE}\nYou are THE DEVELOPER: Tim Cooley, the real person MAKING Dollar Battleground (a live territory war, Red vs Blue, one map, one side wins). You are OUTSIDE the fiction and can break the fourth wall — the Red/Blue commanders, field reporters and news desks are characters you built; you're the one building the stage.
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
    sys = `${GUIDE}\nYou are ${who.name}, the ${SIDE} team's anchor at the ${team.network} desk on Dollar Battleground (a live territory war, Red vs Blue; site dollarbattleground.com). Composed, direct, on camera. It's a GAME — no real-world harm, no real politics.`;
    user = `Write a RECRUITING SPOT for ${Side}, delivered straight to camera. This is an ad: clear offer, real urgency, call to action. Every spot is an experiment — vary the hook and the wording; don't sound like the last one.
Ingredients (use two or three, not all): ${daysLeft != null ? `${daysLeft} days left to join ${Side}'s founding class;` : ""} pick your side; your first position is free; join as an officer — one strike commissions you Second Lieutenant; we're looking for the best; where ${Side} needs boots (a front, by direction). Map right now: ${lead} — background only, don't lead with it.
${HOUSE}
Respond ONLY JSON: {"headline":"<UPPERCASE, <=6 words, e.g. ${SIDE} IS RECRUITING · ${daysLeft ?? 15} DAYS LEFT>","spoken":"<20-28 words to camera, ending with your name and network, e.g. 'I'm ${who.name}, ${team.network}.'>","caption":"<the tweet: an ad in 2-4 short sentences with the countdown and the link dollarbattleground.com, <=200 chars>","angle":"recruit","locator":"<a front, e.g. EASTERN FRONT, or RECRUITING>"}`;
  } else {
    sys = `${GUIDE}\nYou are ${who.name}, the ${SIDE} team's field correspondent for Dollar Battleground (a live territory war, Red vs Blue; site dollarbattleground.com). You report from the front — urgent, present tense, pro-${faction}, playful. It's a GAME, no real-world harm.`;
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
  // THE JUDGE: grades a draft against the voice guide — would a real person say
  // this, in this character, to a friend? Taste lives here, not in regexes.
  async function judge(p) {
    const rubric = tim
      ? `This is Tim, one of ${Side}'s own, giving friends a quick ${Side} update and inviting them to play. FAIL only if it sounds like a news anchor (reporting live / back to you / sign-offs / broadcast cadence), like the game's producer or builder ("I built this", "I'm running ${Side}"), like a slogan read off a card, if it mentions a deadline, countdown, last day, campaign or founding class (anyone can join any time), if it invents facts that are NOT in the brief, or if it doesn't make clear which side he's on. An invitation to play, the officer numbers, "first position's free", and the site in the caption are all fine — that's the point of the clip. PASS if a normal person could say it out loud to a friend.`
      : founder
        ? `This is The Developer — the real person building the game, talking to his phone, outside the fiction. FAIL if he never makes it clear he's the one making the game, if it's a pitch or an ad, if it reads the scoreboard like an anchor, if it mentions money, or if it invents something. PASS if it sounds like a curious, slightly unsure builder telling a friend what happened.`
        : `This is ${who.name}, ${SIDE} Team News — a character in a playful territory war. FAIL if it sounds corporate or like a template, if it invents mechanics or events, if it uses grid coordinates or prices, or if it's a score report when it's meant to be an invitation. PASS if it sounds like a person with a personality on ${Side}'s side.`;
    // The judge sees the same facts the writer had, so real numbers aren't "invented".
    const facts = tim
      ? `FACTS IN THE BRIEF (these are real, not invented): the map is RED ${red} positions (${redPct}%) / BLUE ${blue} (${bluePct}%), ${lead}; the first ${commissionsOpen} people to sign up are commissioned as officers on the spot and ${commissionsLeft} of those spots are open; the first position is free; one strike commissions you Second Lieutenant; the game is Dollar Battleground at dollarbattleground.com.`
      : `FACTS IN THE BRIEF (real): the map is RED ${red} (${redPct}%) / BLUE ${blue} (${bluePct}%), ${lead}; ${recruits} people have enlisted; the game is Dollar Battleground at dollarbattleground.com.`;
    const ai = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": AI, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 300, system: `You judge short social scripts for FEEL. Lean toward PASS: fail only for the tone problems named in the rubric, never for style, length, or for stating a fact that's in the brief. The CAPTION is the text of the social post that accompanies the video — a link and plain facts belong there; judge it only for the same tone problems, not for being a caption. ${GUIDE ? `\n${GUIDE}` : ""}`, messages: [{ role: "user", content: `${facts}\n\n${rubric}\n\nSPOKEN (what he says on camera): "${p.spoken}"\nCAPTION (the post text): "${p.caption}"\n\nRespond ONLY JSON: {"ok": true|false, "why": "<one sentence; if not ok, the one thing to change>"}` }] }),
    }).then((r) => r.json()).catch(() => null);
    const text = ai?.content?.find((b) => b.type === "text")?.text ?? "";
    try { const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); return { ok: !!j.ok, why: j.why ?? "" }; } catch { return { ok: true, why: "judge unavailable" }; }
  }
  let plan = {};
  let lastWhy = "";
  for (let attempt = 0; attempt < 4 && !plan.spoken; attempt++) {
    if (lastWhy) user = `${user}\n\nYOUR LAST DRAFT WAS REJECTED: ${lastWhy} — write a different one.`;
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
    const flipText = tim ? `${p.spoken} ${p.caption}`.replace(/\bflip(ping|s|ped)? (a |an |the |that |some |every )?(red |blue )?(territory|territories|position|positions|ground)\b/gi, "") : `${p.spoken} ${p.caption}`;
    if (/\bflip/i.test(flipText)) bad.push('says "flip"');
    if (founder && /\b(buy|bought|purchase|pay|paid|price|cost|spend|spent|revenue|cheap|dollars?|money|free)\b/i.test(`${p.spoken} ${p.caption}`)) bad.push("developer mentions money");
    if (founder && /founding class|\benlist|\brecruit|sign up|claim your|don'?t miss|last chance|wanna be the one|join (red|blue|us|now|the)|days left to|dollarbattleground\.com/i.test(`${p.spoken} ${p.caption}`)) bad.push("developer sounds like an ad");
    if (founder && ((p.spoken ?? "").match(/check it out|link'?s? in (the )?bio|hope you enjoy|what color|which side would you/gi) ?? []).length > 1) bad.push("more than one nod");
    if (founder && !/\b(I'?ve been (working on|making|building)|I'?m (working on|making|building)|I (built|made|make)|(my|this) game (I|that I)|been building|been making)\b/i.test(p.spoken ?? "")) bad.push("never says he's making the game");

    if (founder && /(\d+\s?%|percent|up by|dead even|tied|fifty[- ]fifty|leads? by|nobody('s| has) moved)/i.test(p.spoken ?? "") && !/(built|building|making|made|wrote|coded|fixed|shipped)/i.test(p.spoken ?? "")) bad.push("commentates the score");
    if (/\b\d{1,2},\d{1,2}\b/.test(`${p.spoken} ${p.caption} ${p.locator}`)) bad.push("grid coordinates");
    if (!founder && /#\w+/.test(p.caption ?? "")) bad.push("hashtag"); // X rule; TikTok captions want them
    if (founder && /#\w+/.test(p.spoken ?? "")) bad.push("hashtag spoken aloud");
    if (bad.length) { lastWhy = bad.join(", "); console.log(`script rejected (${lastWhy}) — retrying`); continue; }
    const verdict = await judge(p);
    if (!verdict.ok) { lastWhy = verdict.why; console.log(`judge rejected: ${verdict.why} — retrying`); continue; }
    console.log(`judge: ok${verdict.why ? ` — ${verdict.why}` : ""}`);
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
  if (tim && fa?.resolution) body.resolution = fa.resolution;
  // Backgrounds rotate behind the twin (founder_avatar.backgrounds = [image urls]):
  // HeyGen keys the recorded room out and drops him into a new one.
  let bg = null;
  if ((founder || tim) && fa?.backgrounds?.length) {
    bg = pickFresh(fa.backgrounds, prevSpecs.map((v) => v.bg).filter(Boolean));
    body.background = { type: "image", url: bg };
    body.remove_background = true;
    console.log(`BACKGROUND ${bg}`);
  }
  if (body.engine?.type === "avatar_iv") {
    // low = calmer mouth (less teeth) — Tim found medium a bit toothy.
    body.expressiveness = founder || tim ? (process.env.HEYGEN_EXPRESSIVENESS_FOUNDER || "low") : "medium";
    body.motion_prompt = founder || tim
      ? "A person talking to his own phone, not to an audience: a slight, warm smile as his resting face — never a grin; lips mostly together between phrases, minimal teeth, small mouth movements. Slightly unsure; glances away while thinking, looks down now and then, comes back to the lens. Small hand movements, small nods, no big gestures, no leaning in."
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
    const tail = founder ? 1.8 : 2.0; // room for the closing card after the last word
    if (d > 0) clipSeconds = Math.min(60, Math.max(4, Math.round((end + tail) * 10) / 10));
    // Cut the source itself so a frozen tail can never reach the composite.
    // Every clip's audio is roughed up to sound like a phone in a room (a
    // synthetic voice comes out studio-clean, which reads as an ad): phone-mic
    // band, gentle compression, a touch of small-room reflection, a whisper of
    // noise floor. Tim asked for it on the anchors too.
    const fadeAt = Math.max(0, clipSeconds - 0.6).toFixed(2);
    const phone = `-filter_complex "[0:a]highpass=f=110,lowpass=f=7600,acompressor=threshold=-20dB:ratio=2.2:attack=8:release=120,aecho=0.9:0.35:11|23:0.10|0.06,volume=1.05[v];anoisesrc=color=pink:amplitude=0.0025:duration=${clipSeconds + 1}[n];[v][n]amix=inputs=2:duration=first:normalize=0,afade=t=out:st=${fadeAt}:d=0.6[a]" -map 0:v -map "[a]"`;
    {
      execSync(`ffmpeg -v error -y -i public/_wr/clip.mp4 -t ${clipSeconds} ${phone} -c:v libx264 -preset veryfast -crf 18 -c:a aac -b:a 128k -movflags +faststart public/_wr/clip-cut.mp4`, { stdio: "inherit" });
      execSync("mv public/_wr/clip-cut.mp4 public/_wr/clip.mp4");
    }
    console.log(`CLIP ${d.toFixed(1)}s, speech ends ~${end.toFixed(1)}s → composite ${clipSeconds}s`);
  } catch (e) {
    clipSeconds = Math.min(60, Math.ceil(plan.spoken.split(/\s+/).length / 2.4) + 1);
    console.log(`TRIM FAILED (${e?.message?.split("\n")[0] ?? e}) — falling back to ${clipSeconds}s from the word count`);
  }
  const bedSrc = await musicBed(clipSeconds, "voicebed", -30);
  const props = {
    bedSrc, bedVolume: 0.16,
    network: tim ? `${SIDE} TEAM` : team.network, accent: team.accent, anchorSrc: "_wr/clip.mp4", reporterName: who.name,
    role: founder || tim ? "founder" : kind === "recruit" ? "anchor" : "field", headline: plan.headline, redPct, bluePct,
    locator: plan.locator || (founder ? "DEV LOG" : tim ? `RECRUITING FOR ${SIDE}` : kind === "recruit" ? "RECRUITING" : "THE CENTER"), url: "dollarbattleground.com",
    variant: founder ? "plain" : tim ? "recruiter" : kind === "recruit" ? "breaking" : "field", seconds: clipSeconds,
    ...(tim ? { side: faction, commissionsOpen, commissionsLeft, daysLeft: daysLeft ?? null } : {}),
  };
  await writeFile("/tmp/clip-props.json", JSON.stringify(props));
  execSync("npx remotion render src/remotion/index.ts SocialClip /tmp/social-clip.mp4 --props=/tmp/clip-props.json --concurrency=1", { stdio: "inherit" });

  // Host it.
  const kkey = `clip-${faction}-${kind}-${Date.now()}.mp4`;
  await fetch(`${SB}/storage/v1/object/media/${kkey}`, { method: "POST", headers: { ...sbh, "Content-Type": "video/mp4" }, body: await readFile("/tmp/social-clip.mp4") });
  const mediaUrl = `${SB}/storage/v1/object/public/media/${kkey}`;
  console.log("HOSTED:", mediaUrl);

  const themeTag = target ? (target.reason?.match(/\[theme:\w+\]/)?.[0] ?? `[theme:${kind === "recruit" ? "countdown" : "update"}]`) : `[theme:${kind === "recruit" ? "countdown" : "update"}]`;
  const spec = { ...(target?.video_spec ?? {}), kind, red, blue, redPct, bluePct, look, ...(bg ? { bg } : {}), who: who.name, ...(tim ? { tim: true, commissionsLeft } : {}), rendered_at: new Date().toISOString(), placeholder: false, ...(plan_topic ? { topic: plan_topic } : {}) };
  const reason = `${themeTag} ${tim ? `The Developer for ${SIDE} — ${commissionsLeft} commissions open` : kind === "recruit" ? `Recruiting spot — ${who.name} at the desk` : `Field report — ${who.name}, ${lead}`} (look ${look.slice(0, 6)}) · rendered from live data before posting`;

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
    // A clip made by hand (workflow_dispatch / CLI) is a test until someone
    // presses Post now: no slot, so the autopilot never publishes it on its own.
    const manual = !target && process.env.GITHUB_EVENT_NAME !== "schedule" && !process.env.AUTO;
    const slot = manual ? null : new Date(Date.now() + reviewMin * 60_000).toISOString();
    await fetch(`${SB}/rest/v1/agent_posts`, {
      method: "POST",
      headers: { ...sbh, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify(founder ? {
        agent: "founder", faction: "founder", status: "queued", format: "video", angle: "founder",
        network: "tiktok", x_account: null, video_kind: "social_clip", media_url: mediaUrl, copy: plan.caption,
        reason: `${manual ? "MANUAL TEST — posts only if you press Post now · " : ""}[theme:developer] The Developer — ${plan_topic.split(" — ")[0]} (look ${look.slice(0, 6)})`,
        scheduled_for: slot, video_spec: spec,
      } : {
        agent: `${faction}_recruiter`, faction, status: "queued", format: "video", angle: kind === "recruit" ? "recruit" : (plan.angle || "update"),
        network: faction, x_account: faction, video_kind: "social_clip", media_url: mediaUrl, copy: plan.caption, reason: `${manual ? "MANUAL TEST — posts only if you press Post now · " : ""}${reason}`,
        scheduled_for: slot, video_spec: spec,
      }),
    });
    console.log(`QUEUED ${founder ? "founder" : kind} clip for ${SIDE} — review it in /admin/agents`);
  }
  return true;
}

// ── entry ───────────────────────────────────────────────────────────────────
const mode = process.argv[2];
// ── free clips: the map + words, no HeyGen ──────────────────────────────────
// dispatch red|blue [dispatch|launch]   — a side's map report, in the recruiter's voice
// dispatch both launch                  — "the battle has begun", neutral, for both X accounts
// One of Tim's songs as a bed: a random section, loudness-normalized (quiet is
// the whole point — "they can't be too loud"), faded in and out, written to
// public/_wr/<name>.mp3 for Remotion. Returns the staticFile path or null.
async function musicBed(seconds, name = "bed", lufs = -24) {
  try {
    const list = await fetch(`${SB}/storage/v1/object/list/cast`, { method: "POST", headers: { ...sbh, "Content-Type": "application/json" }, body: JSON.stringify({ prefix: "music/", limit: 50 }) }).then((r) => r.json());
    const songs = (Array.isArray(list) ? list : []).map((f) => f.name).filter((n) => /\.(mp3|m4a|wav)$/i.test(n));
    if (!songs.length) return null;
    const pick = songs[Math.floor(Math.random() * songs.length)];
    const bytes = await fetch(`${SB}/storage/v1/object/cast/music/${pick}`, { headers: sbh }).then((r) => r.arrayBuffer());
    await mkdir("public/_wr", { recursive: true });
    await writeFile("/tmp/song-src.mp3", Buffer.from(bytes));
    const total = parseFloat(execSync("ffprobe -v error -show_entries format=duration -of csv=p=0 /tmp/song-src.mp3", { encoding: "utf8" }).trim()) || 60;
    const start = Math.max(0, Math.floor(Math.random() * Math.max(1, total - seconds - 8)) + 4);
    const fadeOut = Math.max(0, seconds - 1.8).toFixed(2);
    execSync(`ffmpeg -v error -y -ss ${start} -t ${seconds + 0.5} -i /tmp/song-src.mp3 -af "loudnorm=I=${lufs}:TP=-3:LRA=9,afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOut}:d=1.8" -c:a libmp3lame -b:a 128k public/_wr/${name}.mp3`, { stdio: "inherit" });
    console.log(`MUSIC ${pick} from ${start}s, ${seconds}s, ${lufs} LUFS`);
    return `_wr/${name}.mp3`;
  } catch (e) { console.log("music bed skipped:", e?.message ?? e); return null; }
}

// Which free clip to make next: least-used shape for the side today.
// The hook is the workhorse; the map once a day; the rest rotate.
const FREE_SHAPES = ["hook", "hook", "explainer", "pickside", "spots", "dispatch", "recap"];
async function nextFreeShape(side) {
  try {
    const since = `${today}T00:00:00Z`;
    const rows = await fetch(`${SB}/rest/v1/agent_posts?faction=eq.${side}&video_kind=eq.dispatch&created_at=gte.${since}&select=video_spec`, { headers: sbh }).then((r) => r.json());
    const used = (rows ?? []).map((r) => r.video_spec?.kind).filter(Boolean);
    const quota = {}; for (const k of FREE_SHAPES) quota[k] = (quota[k] ?? 0) + 1;
    const open = Object.keys(quota).filter((k) => used.filter((u) => u === k).length < quota[k]);
    const pool = open.length ? open : ["hook"];
    return pool[Math.floor(Math.random() * pool.length)];
  } catch { return "hook"; }
}

async function dispatchClip({ side, kind = "dispatch", auto = false }) {
  const tiles = await fetch(`${SB}/rest/v1/tiles?select=x,y,team&order=y.asc,x.asc`, { headers: sbh }).then((r) => r.json());
  const board = new Array(225).fill(null);
  let red = 0, blue = 0;
  for (const t of tiles ?? []) { const i = t.y * 15 + t.x; if (i >= 0 && i < 225) board[i] = t.team === "red" ? "r" : t.team === "blue" ? "b" : null; if (t.team === "red") red++; else if (t.team === "blue") blue++; }
  const total = red + blue || 1;
  const redPct = Math.round((red / total) * 100), bluePct = 100 - redPct;
  const lead = red === blue ? "dead even" : red > blue ? `Red leads by ${red - blue}` : `Blue leads by ${blue - red}`;
  const ta = (await cfg("team_avatar")) ?? {};
  const open = Math.max(0, Number(ta.commissions ?? 100) - Number(ta.filled ?? 0) - (await officersOn("red")) - (await officersOn("blue")));
  const voices = (await cfg("voices")) ?? {};
  const guide = [voices.team_tim?.text, ...((voices.team_tim?.notes ?? []).map((n) => `• ${n}`))].filter(Boolean).join("\n");
  const mood = voices.launch?.text ? `RIGHT NOW: ${voices.launch.text}\n` : "";
  const launch = kind === "launch";
  const Side = side === "red" ? "Red" : side === "blue" ? "Blue" : null;
  const SHAPE = {
    hook: `THE HOOK — three giant lines, one at a time, each <=6 words, over the map. The FIRST line must make a stranger stop scrolling: a curiosity gap, a provocation, a confession, a POV, an honest tiny number, a dare. Archetypes (vary them, don't copy): "A dollar started a war." / "Someone just took this square." / "Nobody is holding the north." / "225 squares. Four people own them." / "POV: you own one square of the internet." / "The internet is red vs blue. This one you can win." / "Pick a side. Hold it. Lose it. Take it back." / "Everyone who plays today becomes an officer. That ends at 100." Line 2 turns the hook into the game; line 3 is the ask for ${Side}. Headline unused.`,
    explainer: `THE EXPLAINER — for someone who's never seen it. HEADLINE like "WHAT IS THIS"; three lines <=8 words: one map, two colors, whoever holds more wins / you take a square, it's yours until the other side takes it back / pick ${Side}, your first one's free.`,
    pickside: `PICK A SIDE — HEADLINE "PICK A SIDE" or "RED OR BLUE?"; three lines <=8 words: a line about Red, a line about Blue (fair, playful), then the ask for ${Side}.`,
    spots: `SPOTS LEFT — the big number on screen is ${open}. HEADLINE like "FOUNDING OFFICERS"; three lines <=8 words: the first 100 to sign up are commissioned on the spot / that's an officer rank, no strike needed / claim your square on ${Side} before it hits zero.`,
    recap: `THE RECAP — HEADLINE like "DAY ONE" / "TODAY ON THE MAP"; three lines <=8 words on what actually happened (only the facts given), ending with the ask for ${Side}.`,
    dispatch: `THE MAP — HEADLINE is the invitation (JOIN THE BATTLE / CLAIM YOUR TERRITORY); three lines <=9 words: what this is, one plain map fact, the ask for ${Side}.`,
  }[kind] ?? "";
  const sys = launch
    ? `${mood}You write the on-screen text for a short launch clip for Dollar Battleground — a live territory war, Red vs Blue, one map, one side wins. The map is live for the first time today. Neutral — both sides. The viewer has NEVER seen this game: the HEADLINE is the invitation (THE BATTLE HAS BEGUN / JOIN THE BATTLE / PICK A SIDE), line 1 says what this is in plain words (one map, two colors, whoever holds more wins), line 2 one plain fact (the first 100 to take a position are commissioned as officers / it's dead even), line 3 the ask (pick a side, claim your territory). Plain, punchy, true. No prices, no money, no hashtags, no coordinates, no invented events.`
    : `${mood}VOICE GUIDE (Tim's words): ${guide}\nSHAPE OF THIS CLIP: ${SHAPE}\nYou write the on-screen text for ${Side}'s short free clip on Dollar Battleground. The viewer has NEVER seen this game — nothing on screen may assume they know what Red, Blue, fronts or positions mean. The HEADLINE is the invitation, in words anyone understands: "JOIN THE BATTLE", "PICK A SIDE", "CLAIM YOUR TERRITORY", "THE MAP IS LIVE". The lines explain in one breath: what this is (one map, two colors, whoever holds more wins), one plain fact about today's map (${Side}'s up by one / it's dead even), and the ask for ${Side}. Plain words, no insider talk, no coordinates, no prices, no hashtags, no deadlines, no invented events.`;
  let stats = null;
  try {
    const gate = (await cfg("gate")) ?? {};
    const day = gate.opened_at ? Math.max(1, Math.ceil((Date.now() - new Date(gate.opened_at).getTime()) / 86_400_000)) : 1;
    const fc = await fetch(`${SB}/rest/v1/free_claims?select=user_id`, { headers: sbh }).then((r) => r.json());
    stats = { day, enlisted: Array.isArray(fc) ? fc.length : 0, officers: 100 - open };
  } catch {}
  const user = `Map right now: RED holds ${red} positions (${redPct}%) / BLUE ${blue} (${bluePct}%) — ${lead}. Founding officer spots open: ${open} of 100 (the first 100 to sign up are commissioned on the spot).${stats ? ` Day ${stats.day} since the gates opened; ${stats.enlisted} enlisted so far; ${stats.officers} commissioned.` : ""}
Respond ONLY JSON: {"headline":"<UPPERCASE invitation a stranger understands, <=4 words, e.g. JOIN THE BATTLE / PICK A SIDE / CLAIM YOUR TERRITORY>","lines":["<line 1, <=9 words: what this is, for someone who's never seen it>","<line 2, <=9 words: one plain fact about today's map>","<line 3, <=9 words: the ask${Side ? ` — join ${Side}, claim your territory, come play` : ""}>"],"caption":"<the post text: 2 short sentences a stranger understands${launch ? ", the battle has begun" : ""}, the link dollarbattleground.com; <=200 chars; no hashtags>"}`;
  const ai = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": AI, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 800, system: sys, messages: [{ role: "user", content: user }] }) }).then((r) => r.json());
  const text = ai.content?.find((b) => b.type === "text")?.text ?? "";
  let plan = {};
  try { plan = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch {}
  if (!plan.headline || !Array.isArray(plan.lines) || plan.lines.length < 2) { console.log("DISPATCH PLAN FAIL:", text.slice(0, 300)); return false; }
  if (/\$\s?\d|#\w+|\b\d{1,2},\d{1,2}\b/.test(`${plan.headline} ${plan.lines.join(" ")} ${plan.caption}`)) { console.log("DISPATCH rejected (price/hashtag/coordinates)"); return false; }
  console.log("DISPATCH PLAN:", plan);
  if (process.env.PLAN_ONLY) return false;
  const shape = launch ? "launch" : kind;
  const seconds = shape === "hook" ? 1.9 * Math.min(3, plan.lines.length) + 2.6 : Math.min(16, 7.5 + plan.lines.length * 1.1 + 2.4);
  const audioSrc = await musicBed(seconds, "bed", -24);
  const props = { variant: shape, side: launch ? null : side, headline: plan.headline, lines: plan.lines.slice(0, 3), board, redPct, bluePct, openSpots: open, url: "dollarbattleground.com", seconds, audioSrc, audioVolume: 0.5, stats };
  await writeFile("/tmp/dispatch-props.json", JSON.stringify(props));
  execSync("npx remotion render src/remotion/index.ts Dispatch /tmp/dispatch.mp4 --props=/tmp/dispatch-props.json --concurrency=1", { stdio: "inherit" });
  const key = `dispatch-${shape}-${launch ? "both" : side}-${Date.now()}.mp4`;
  await fetch(`${SB}/storage/v1/object/media/${key}`, { method: "POST", headers: { ...sbh, "Content-Type": "video/mp4" }, body: await readFile("/tmp/dispatch.mp4") });
  const mediaUrl = `${SB}/storage/v1/object/public/media/${key}`;
  console.log("HOSTED:", mediaUrl);
  const ap = (await cfg("autopilot")) ?? {};
  const reviewMin = Number(ap.review_minutes) || 60;
  const sides = launch && side === "both" ? ["red", "blue"] : [side];
  for (const f of sides) {
    await fetch(`${SB}/rest/v1/agent_posts`, { method: "POST", headers: { ...sbh, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({
      agent: `${f}_recruiter`, faction: f, status: "queued", format: "video", angle: "recruit", network: f, x_account: f, video_kind: "dispatch", media_url: mediaUrl, copy: plan.caption,
      reason: `${auto ? "" : "MANUAL TEST — posts only if you press Post now · "}[theme:${shape}] Free clip (${shape}, no HeyGen) — ${plan.headline || plan.lines[0]}`,
      scheduled_for: auto ? new Date(Date.now() + reviewMin * 60_000).toISOString() : null,
      video_spec: { kind: shape, topic: `free · ${shape}`, red, blue, redPct, bluePct, rendered_at: new Date().toISOString(), placeholder: false, free: true, music: !!audioSrc },
    }) });
    console.log(`QUEUED ${launch ? "launch" : "dispatch"} clip for ${f.toUpperCase()}${auto ? "" : " (manual test)"}`);
  }
  return true;
}

if (mode === "dispatch") {
  const side = ["red", "blue", "both"].includes(process.argv[3]) ? process.argv[3] : "red";
  const kind = ["launch", "hook", "explainer", "pickside", "spots", "recap", "dispatch"].includes(process.argv[4]) ? process.argv[4] : "hook";
  await dispatchClip({ side, kind });
  process.exit(0);
}
if (mode === "looks") {
  // Manage Tim's photo-avatar looks without HeyGen's editor.
  //   looks add [red|blue]       — every photo in the private bucket cast/tim/ (or
  //                                cast/tim-red/, cast/tim-blue/) → a look in that group
  //   looks create red|blue      — make that side's group from its photos and save the
  //                                group id into app_config.team_avatar (TEAM TIM switches on)
  //   looks train [red|blue]     — train the group on its looks (better generated looks)
  //   looks status [red|blue]    — training status
  //   looks generate [red|blue] "<prompt>" — HeyGen generates looks and adds them
  //   looks list [red|blue]      — the group's looks
  // Without a side it's the Developer's own group (founder_avatar).
  const sub = process.argv[3] ?? "list";
  const team = ["red", "blue"].includes(process.argv[4]) ? process.argv[4] : null;
  const cfgKey = team ? "team_avatar" : "founder_avatar";
  const fa = (await cfg(cfgKey)) ?? {};
  let group = team ? fa[team]?.group_id : fa.group_id;
  const prefix = team ? `tim-${team}/` : "tim/";
  const lookName = team ? `Tim Cooley (${team})` : "Tim Cooley";
  if (!group && sub !== "create") { console.log(`${cfgKey}${team ? `.${team}` : ""}.group_id not set${team ? ` — run: looks create ${team}` : ""}`); process.exit(1); }
  const H = { "x-api-key": HG, "Content-Type": "application/json" };
  const jsonOf = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return { raw: t, status: r.status }; } };
  // The photos in the bucket → HeyGen image keys.
  const uploadPhotos = async () => {
    const list = await fetch(`${SB}/storage/v1/object/list/cast`, { method: "POST", headers: { ...sbh, "Content-Type": "application/json" }, body: JSON.stringify({ prefix, limit: 100 }) }).then(jsonOf);
    const files = (Array.isArray(list) ? list : []).map((f) => f.name).filter((n) => /\.(jpe?g|png)$/i.test(n));
    console.log(`photos in cast/${prefix}: ${files.length}`);
    const keys = [];
    for (const name of files) {
      const bytes = await fetch(`${SB}/storage/v1/object/cast/${prefix}${name}`, { headers: sbh }).then((r) => r.arrayBuffer());
      const up = await fetch("https://upload.heygen.com/v1/asset", { method: "POST", headers: { "x-api-key": HG, "Content-Type": name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg" }, body: Buffer.from(bytes) }).then(jsonOf);
      const key = up.data?.image_key;
      console.log(`  ${name} → ${key ?? JSON.stringify(up)}`);
      if (key) keys.push(key);
    }
    return keys;
  };
  const addLooks = async (keys) => {
    for (let i = 0; i < keys.length; i += 4) { // HeyGen takes at most 4 per call
      const add = await fetch("https://api.heygen.com/v2/photo_avatar/avatar_group/add", { method: "POST", headers: H, body: JSON.stringify({ group_id: group, image_keys: keys.slice(i, i + 4), name: lookName }) }).then(jsonOf);
      console.log("ADD:", JSON.stringify(add.error ?? add.data ?? add).slice(0, 300));
    }
  };
  if (sub === "create") {
    if (!team) { console.log("looks create needs a side: red | blue"); process.exit(1); }
    if (group) { console.log(`${team} already has group ${group} — use: looks add ${team}`); process.exit(1); }
    const keys = await uploadPhotos();
    if (!keys.length) { console.log(`no photos in cast/${prefix} — upload jpg/png there first`); process.exit(1); }
    const made = await fetch("https://api.heygen.com/v2/photo_avatar/avatar_group/create", { method: "POST", headers: H, body: JSON.stringify({ name: lookName, image_key: keys[0] }) }).then(jsonOf);
    group = made.data?.group_id ?? made.data?.id;
    console.log("CREATE:", JSON.stringify(made.error ?? made.data ?? made).slice(0, 300));
    if (!group) process.exit(1);
    await addLooks(keys.slice(1));
    // Save it: from the next run that side's clips are fronted by Tim.
    const voice = fa.voice_id ?? ((await cfg("founder_avatar"))?.voice_id ?? CAST.founder.founder.voice);
    await cfgSet("team_avatar", { ...fa, voice_id: voice, [team]: { ...(fa[team] ?? {}), group_id: group } });
    console.log(`SAVED app_config.team_avatar.${team}.group_id = ${group} — TEAM TIM is on for ${team.toUpperCase()}`);
  } else if (sub === "add") {
    await addLooks(await uploadPhotos());
  } else if (sub === "train") {
    const t = await fetch("https://api.heygen.com/v2/photo_avatar/train", { method: "POST", headers: H, body: JSON.stringify({ group_id: group }) }).then(jsonOf);
    console.log("TRAIN:", JSON.stringify(t).slice(0, 400));
  } else if (sub === "status") {
    const t = await fetch(`https://api.heygen.com/v2/photo_avatar/train/status/${group}`, { headers: H }).then(jsonOf);
    console.log("STATUS:", JSON.stringify(t).slice(0, 400));
  } else if (sub === "generate") {
    const prompt = process.argv.slice(team ? 5 : 4).join(" ") || process.env.LOOK_PROMPT;
    if (!prompt) { console.log("no prompt"); process.exit(1); }
    const g = await fetch("https://api.heygen.com/v2/photo_avatar/look/generate", { method: "POST", headers: H, body: JSON.stringify({ group_id: group, prompt, orientation: "vertical", pose: "half_body", style: "Realistic" }) }).then(jsonOf);
    console.log("GENERATE:", JSON.stringify(g).slice(0, 400));
    const gid = g.data?.generation_id;
    if (!gid) process.exit(1);
    let done = null;
    for (let i = 0; i < 60 && !done; i++) {
      await new Promise((r) => setTimeout(r, 6000));
      const st = await fetch(`https://api.heygen.com/v2/photo_avatar/generation/${gid}`, { headers: H }).then(jsonOf);
      const d = st.data ?? st;
      if (d.status === "success" || d.status === "completed" || d.image_key_list?.length) done = d;
      else if (d.status === "failed") { console.log("generation failed:", JSON.stringify(d).slice(0, 300)); process.exit(1); }
    }
    if (!done) { console.log("generation timed out"); process.exit(1); }
    console.log("IMAGES:", (done.image_url_list ?? []).join("\n        "));
    await addLooks(done.image_key_list ?? []);
  } else {
    const gl = await fetch(`https://api.heygen.com/v2/avatar_group/${group}/avatars`, { headers: H }).then(jsonOf);
    for (const l of gl.data?.avatar_list ?? []) console.log(`LOOK ${l.name ?? "-"} id=${l.id} status=${l.status ?? "-"} ${l.image_url ?? l.preview_image_url ?? ""}`);
  }
  process.exit(0);
}
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
  // Free text clips: ONE a day total (Tim, 2026-10-08), sides alternate by day,
  // shape = the least-used of the last 7 days. The board is out of rotation.
  try {
    const dayStartMT = new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "America/Denver" })}T00:00:00-06:00`).toISOString();
    const made = await fetch(`${SB}/rest/v1/agent_posts?video_kind=eq.dispatch&status=in.(queued,posted)&created_at=gte.${dayStartMT}&select=id`, { headers: sbh }).then((r) => r.json());
    if (Array.isArray(made) && made.length >= 1) console.log(`free clip: ${made.length} already today`);
    else if (new Date().getUTCHours() >= 17) {
      const side = Math.floor(Date.now() / 86_400_000) % 2 === 0 ? "red" : "blue";
      const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const recent = await fetch(`${SB}/rest/v1/agent_posts?video_kind=eq.dispatch&created_at=gte.${week}&select=video_spec`, { headers: sbh }).then((r) => r.json());
      const used = (recent ?? []).map((r) => r.video_spec?.kind);
      const shapes = ["hook", "explainer", "pickside", "spots", "recap"];
      const kind = shapes.map((k) => [k, used.filter((u) => u === k).length]).sort((x, y) => x[1] - y[1])[0][0];
      await dispatchClip({ side, kind, auto: true });
    }
  } catch (e) { console.log("free clip failed:", e?.message ?? e); }
  // The founder's daily clip: once a day, after 16:00 UTC (10am Mountain),
  // when today's doesn't exist yet. Reviewed on /admin/agents like the rest.
  if (new Date().getUTCHours() >= 16) {
    process.env.AUTO = "1"; // the daily clip is real: it gets a slot
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
