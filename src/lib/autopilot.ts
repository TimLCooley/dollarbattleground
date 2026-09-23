import "server-only";
import { cfgGet, cfgSet, type Db } from "@/lib/app-config";
import { decideNextPost, themeOf, type Angle, type Theme } from "@/lib/recruiter";
import { getTweetMetrics, postTweet, postTweetWithMedia, uploadVideo, type Faction } from "@/lib/x";
import { produceVideo } from "@/lib/producer";
import { getStripeMode } from "@/lib/stripe-mode";
import { intelBrief } from "@/lib/intel";
import { getCommanderNotes, getOrders, planOrders } from "@/lib/general";
import { runDispatches } from "@/lib/dispatch";

export type { Db };

// Autopilot: the deny-only posting loop. A draft lands 'queued' with a
// scheduled_for = now + review window. Each tick (pg_cron → /api/cron/autopilot,
// or "Run now" in admin) publishes what's due and wasn't denied, keeps each
// team's queue topped up so the Commander always has something to review, and
// refreshes X metrics hourly. Kill switch + knobs live in app_config.autopilot
// (a text column holding JSON); the last tick's result in autopilot_state.

export const DEFAULT_GOAL =
  "Recruit 1,000 contacts in the 15-day campaign — 500 for each side. The war is LIVE at dollarbattleground.com: get people to pick your side and take their first position.";

export interface AutopilotConfig {
  enabled: boolean;
  review_minutes: number; // how long the Commander has to deny before it posts
  min_queued_per_team: number; // keep this many drafts (placeholders) per team — a day's slots
  posts_per_day_per_team: number; // slot spacing = 24h / this
  video_per_day_per_team: number; // how many of the day's placeholders are video cards
  refresh_on_publish: boolean; // rewrite the post with live data at post time (drafts are placeholders)
  require_stripe_live: boolean; // never drive traffic to a test-mode checkout
}
const DEFAULTS: AutopilotConfig = {
  enabled: false,
  review_minutes: 60,
  min_queued_per_team: 3,
  posts_per_day_per_team: 3,
  video_per_day_per_team: 1,
  refresh_on_publish: true,
  require_stripe_live: true,
};
// A video placeholder that hasn't rendered by post time waits this long, then goes out as text.
const VIDEO_GRACE_MS = 90 * 60_000;

export interface AutopilotState {
  last_run_at?: string;
  last_result?: string;
  last_metrics_at?: string;
  last_plan_at?: string; // the General re-plans daily from the brief
  published?: number;
  drafted?: number;
  failed?: number;
}

export async function getAutopilot(db: Db): Promise<{ config: AutopilotConfig; state: AutopilotState }> {
  const [c, s] = await Promise.all([
    cfgGet<Partial<AutopilotConfig>>(db, "autopilot"),
    cfgGet<AutopilotState>(db, "autopilot_state"),
  ]);
  return { config: { ...DEFAULTS, ...(c ?? {}) }, state: s ?? {} };
}

export async function setAutopilot(db: Db, patch: Partial<AutopilotConfig>): Promise<AutopilotConfig> {
  const { config } = await getAutopilot(db);
  const next = { ...config, ...patch };
  await cfgSet(db, "autopilot", next);
  return next;
}

// ── context the brain needs ─────────────────────────────────────────────────

async function recentContext(db: Db, faction: Faction) {
  const { data } = await db
    .from("agent_posts")
    .select("copy,deny_reason,status,angle,reason")
    .eq("faction", faction)
    .order("created_at", { ascending: false })
    .limit(20);
  const rows = (data ?? []) as { copy: string; deny_reason: string | null; status: string; angle: Angle | null; reason: string | null }[];
  const live = rows.filter((r) => r.status !== "denied");
  return {
    recentCopies: live.map((r) => r.copy).slice(0, 6),
    recentAngles: live.map((r) => r.angle).filter(Boolean).slice(0, 6) as Angle[],
    // Every post is an experiment: the next one leads with a theme the last two didn't.
    recentThemes: rows.map((r) => themeOf(r.reason)).filter(Boolean).slice(0, 4) as Theme[],
    // The Commander's feedback is universal: denials from EITHER team train both.
    denyReasons: await recentDenyReasons(db),
  };
}

export async function recentDenyReasons(db: Db, limit = 10): Promise<string[]> {
  const { data } = await db
    .from("agent_posts")
    .select("deny_reason")
    .eq("status", "denied")
    .not("deny_reason", "is", null)
    .order("decided_at", { ascending: false })
    .limit(limit);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of (data ?? []) as { deny_reason: string }[]) {
    const t = r.deny_reason.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

export async function campaignDaysLeft(db: Db): Promise<number | null> {
  const camp = await cfgGet<{ ends_at?: string }>(db, "campaign");
  if (!camp?.ends_at) return null;
  return Math.max(0, Math.ceil((new Date(camp.ends_at).getTime() - Date.now()) / 86_400_000));
}

// Next slot for a team: never inside the review window, spread by
// posts_per_day, and honoring a requested slot (a denied post's) when it's
// still in the future.
async function nextSlot(db: Db, faction: Faction, cfg: AutopilotConfig, wanted?: string | null): Promise<string> {
  const now = Date.now();
  const earliest = now + cfg.review_minutes * 60_000;
  const spacing = (24 * 60 * 60_000) / Math.max(1, cfg.posts_per_day_per_team);
  const { data } = await db
    .from("agent_posts")
    .select("scheduled_for")
    .eq("faction", faction)
    .in("status", ["queued", "posted"])
    .not("scheduled_for", "is", null)
    .order("scheduled_for", { ascending: false })
    .limit(1);
  const lastRaw = (data?.[0] as { scheduled_for?: string } | undefined)?.scheduled_for;
  const last = lastRaw ? new Date(lastRaw).getTime() : 0;
  const want = wanted ? new Date(wanted).getTime() : 0;
  return new Date(Math.max(earliest, want, last + spacing)).toISOString();
}

// ── the three verbs ─────────────────────────────────────────────────────────

export async function draftPost(
  db: Db,
  faction: Faction,
  goal: string,
  opts: { replaces?: number; slot?: string | null; force?: boolean; video?: boolean } = {},
) {
  // Unless forced (the ⚡ button), only draft when this team's DRAFT column is
  // actually short — so the page's auto-draft and the tick can't double up.
  if (!opts.force) {
    const [{ count }, { config: c }] = await Promise.all([
      db.from("agent_posts").select("id", { count: "exact", head: true }).eq("faction", faction).eq("status", "queued"),
      getAutopilot(db),
    ]);
    if ((count ?? 0) >= c.min_queued_per_team) return null;
  }
  // Chain of command: the brief (Intel Ops) + standing orders (the General)
  // go into every draft.
  const [{ config }, ctx, daysLeft, brief, orders, commanderNotes] = await Promise.all([
    getAutopilot(db),
    recentContext(db, faction),
    campaignDaysLeft(db),
    intelBrief(db),
    getOrders(db),
    getCommanderNotes(db),
  ]);
  const d = await decideNextPost({
    faction,
    goal,
    phase: "live",
    daysLeft,
    brief,
    orders,
    commanderNotes,
    ...ctx,
    forceFormat: opts.video ? "video" : "text",
  });
  if (!d) throw new Error("The brain returned nothing (check GEMINI_API_KEY).");
  const scheduled_for = await nextSlot(db, faction, config, opts.slot);
  // A video placeholder: the producer renders it (script, clip, caption — all
  // from live data) shortly before its slot. Which kind follows the mix.
  const videoSpec = opts.video ? { kind: orders.recruit_pct >= 90 ? "recruit" : "field", placeholder: true } : null;
  const { data, error } = await db
    .from("agent_posts")
    .insert({
      agent: `${faction}_recruiter`,
      faction,
      goal,
      status: "queued",
      format: d.format,
      angle: d.angle,
      network: faction,
      x_account: faction,
      copy: d.copy,
      video_kind: d.videoKind,
      video_spec: videoSpec,
      reason: d.reason,
      scheduled_for,
      replaces: opts.replaces ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

interface PostRow {
  id: number;
  copy: string;
  x_account: string | null;
  faction: string | null;
  format: string;
  angle: Angle | null;
  reason: string | null;
  video_kind: string | null;
  media_url: string | null;
  scheduled_for: string | null;
}

export class NotReady extends Error {}

// X throttles posts that carry an external link, so the link never goes in
// the post body: strip it, publish, then reply to ourselves with the CTA +
// the attributed /r/<id> link as the first comment.
const LINK_RE = /\s*(?:at|→|:|—|–|-)?\s*(?:https?:\/\/)?(?:www\.)?dollarbattleground\.com(?:\/r\/\d+)?\/?[.!]?/gi;
export function stripLink(copy: string): string {
  return copy
    .replace(LINK_RE, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.!?,])/g, "$1")
    .trim()
    .replace(/([A-Za-z0-9)])$/, "$1."); // the link often carried the sentence's period
}
const REPLY_CTA: Record<Faction, string> = {
  red: "Claim your spot for Red →",
  blue: "Claim your spot for Blue →",
};

export async function publishPost(db: Db, id: number): Promise<{ id: string; video: boolean; replyId: string | null }> {
  const { data: row } = await db.from("agent_posts").select("*").eq("id", id).single();
  const p = row as PostRow | null;
  if (!p) throw new Error("not found");
  const f = (p.faction === "blue" || p.x_account === "blue" ? "blue" : "red") as Faction;
  const { config } = await getAutopilot(db);

  // A video placeholder whose clip hasn't rendered yet: wait (the producer
  // checks every 30 min), and only after the grace period go out as text.
  const unrendered = p.format === "video" && p.video_kind === "social_clip" && !p.media_url;
  if (unrendered) {
    const overdue = p.scheduled_for ? Date.now() - new Date(p.scheduled_for).getTime() : 0;
    if (overdue < VIDEO_GRACE_MS) throw new NotReady("clip renders before posting — waiting");
  }

  // Drafts are placeholders: at post time the agent rewrites the copy from
  // live data, keeping the angle and theme the Commander saw on the card.
  // (A rendered clip already had its caption written at render time.)
  let copy = p.copy;
  if (config.refresh_on_publish && !(p.format === "video" && p.media_url)) {
    try {
      const [ctx, daysLeft, brief, orders, commanderNotes] = await Promise.all([
        recentContext(db, f),
        campaignDaysLeft(db),
        intelBrief(db),
        getOrders(db),
        getCommanderNotes(db),
      ]);
      const fresh = await decideNextPost({
        faction: f,
        goal: DEFAULT_GOAL,
        phase: "live",
        daysLeft,
        brief,
        orders,
        commanderNotes,
        ...ctx,
        forceAngle: p.angle ?? undefined,
        forceTheme: themeOf(p.reason) ?? undefined,
        forceFormat: "text",
      });
      if (fresh?.copy) {
        copy = fresh.copy;
        await db
          .from("agent_posts")
          .update({ copy, reason: `${fresh.reason} · refreshed at post time` })
          .eq("id", id);
      }
    } catch (e) {
      console.error(`refresh-at-post failed for #${p.id}, using the draft:`, e instanceof Error ? e.message : e);
    }
  }
  const hasLink = /dollarbattleground\.com/i.test(copy);
  const text = hasLink ? stripLink(copy) : copy;

  let tweet: { id: string };
  let mediaUrl: string | null = p.media_url;
  // A pre-rendered clip (or the evergreen teaser) gets attached; a video post
  // with nothing rendered yet goes out as text.
  const produced = p.format === "video" ? await produceVideo(p.video_kind, p.media_url) : null;
  if (produced) {
    const mediaId = await uploadVideo(f, produced.bytes);
    tweet = await postTweetWithMedia(f, text, mediaId);
    mediaUrl = produced.url;
  } else {
    tweet = await postTweet(f, text);
  }

  // The link, attributed to this post, as the first comment.
  let replyId: string | null = null;
  if (hasLink) {
    try {
      const r = await postTweet(f, `${REPLY_CTA[f]} https://dollarbattleground.com/r/${p.id}`, tweet.id);
      replyId = r.id;
    } catch (e) {
      console.error(`link reply failed for #${p.id}:`, e instanceof Error ? e.message : e);
    }
  }

  await db
    .from("agent_posts")
    .update({
      status: "posted",
      external_id: tweet.id,
      reply_external_id: replyId,
      media_url: mediaUrl,
      posted_at: new Date().toISOString(),
      last_error: replyId || !hasLink ? null : "posted, but the link reply failed",
    })
    .eq("id", id);
  return { id: tweet.id, video: !!produced, replyId };
}

// Pull fresh public metrics from X for everything posted. Returns rows updated.
export async function refreshMetrics(db: Db): Promise<number> {
  const { data } = await db
    .from("agent_posts")
    .select("id,external_id,reply_external_id,faction,x_account")
    .eq("status", "posted")
    .not("external_id", "is", null)
    .limit(300);
  const byFaction: Record<Faction, { id: number; ext: string; ownReply: boolean }[]> = { red: [], blue: [] };
  for (const r of (data ?? []) as { id: number; external_id: string | null; reply_external_id: string | null; faction: string | null; x_account: string | null }[]) {
    const f = (r.faction === "blue" || r.x_account === "blue" ? "blue" : "red") as Faction;
    if (r.external_id) byFaction[f].push({ id: r.id, ext: r.external_id, ownReply: Boolean(r.reply_external_id) });
  }
  let updated = 0;
  const now = new Date().toISOString();
  for (const f of ["red", "blue"] as Faction[]) {
    const rows = byFaction[f];
    if (rows.length === 0) continue;
    try {
      const metrics = await getTweetMetrics(f, rows.map((r) => r.ext));
      for (const r of rows) {
        const m = metrics[r.ext];
        if (!m) continue;
        await db
          .from("agent_posts")
          // Our own link reply is not engagement — don't count it.
          .update({
            impressions: m.impressions,
            likes: m.likes,
            reposts: m.reposts,
            replies: Math.max(0, m.replies - (r.ownReply ? 1 : 0)),
            quotes: m.quotes,
            metrics_at: now,
          })
          .eq("id", r.id);
        updated++;
      }
    } catch (e) {
      console.error(`metrics refresh ${f}:`, e instanceof Error ? e.message : e);
    }
  }
  return updated;
}

// ── the tick ────────────────────────────────────────────────────────────────

const STALE_MS = 12 * 60 * 60_000; // a post this overdue gets a fresh slot, not a blast

export async function runAutopilot(db: Db, opts: { force?: boolean } = {}): Promise<AutopilotState> {
  const { config, state } = await getAutopilot(db);
  const started = new Date().toISOString();
  let published = 0;
  let drafted = 0;
  let failed = 0;
  const notes: string[] = [];
  const save = async (result: string, extra: Partial<AutopilotState> = {}) => {
    const next: AutopilotState = { ...state, ...extra, last_run_at: started, last_result: result, published, drafted, failed };
    await cfgSet(db, "autopilot_state", next);
    return next;
  };

  // Email dispatches (takeover alerts, reminders) are game mechanics, not
  // posting — they run every tick regardless of the switch (their own kill
  // switches live in app_config.dispatch).
  try {
    const d = await runDispatches(db);
    if (d.takeovers || d.reminders || d.waitlist) {
      notes.push(`email: ${d.takeovers} takeover, ${d.reminders} reminder, ${d.waitlist} waitlist`);
    }
    if (d.notified) notes.push(`digest sent (${d.notified} events)`);
  } catch (e) {
    notes.push(`email: ${e instanceof Error ? e.message : "failed"}`);
  }

  // The General re-plans from the brief once a day — even while the switch is
  // OFF, so manual drafts still follow current orders. Only publishing is gated.
  let last_plan_at = state.last_plan_at;
  if (!last_plan_at || Date.now() - new Date(last_plan_at).getTime() > 24 * 60 * 60_000) {
    try {
      await planOrders(db, await intelBrief(db), DEFAULT_GOAL, await campaignDaysLeft(db), {
        commanderNotes: await getCommanderNotes(db),
        denyReasons: await recentDenyReasons(db),
      });
      last_plan_at = started;
      notes.push("the General issued fresh orders");
    } catch (e) {
      notes.push(`plan: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  // Drafting is free and safe, so the queue is filled EVERY tick — up to a
  // day's worth of placeholders per team (one per slot), one of them a video
  // card when the day's video allowance isn't used — whether the switch is on
  // or off. Only publishing is gated below.
  const dayStart = new Date(started.slice(0, 10) + "T00:00:00Z").toISOString();
  for (const f of ["red", "blue"] as Faction[]) {
    const [{ count }, { count: videos }] = await Promise.all([
      db.from("agent_posts").select("id", { count: "exact", head: true }).eq("faction", f).eq("status", "queued"),
      db
        .from("agent_posts")
        .select("id", { count: "exact", head: true })
        .eq("faction", f)
        .eq("format", "video")
        .in("status", ["queued", "posted"])
        .gte("created_at", dayStart),
    ]);
    const need = Math.max(0, config.min_queued_per_team - (count ?? 0));
    let videoLeft = Math.max(0, config.video_per_day_per_team - (videos ?? 0));
    for (let i = 0; i < need; i++) {
      const video = videoLeft > 0;
      try {
        const d = await draftPost(db, f, DEFAULT_GOAL, { video });
        if (!d) break;
        drafted++;
        if (video) videoLeft--;
      } catch (e) {
        failed++;
        notes.push(`draft ${f}: ${e instanceof Error ? e.message : "failed"}`);
        break;
      }
    }
  }

  if (!config.enabled && !opts.force) {
    return save(
      `Autopilot is OFF — nothing published${drafted ? `, ${drafted} drafted for review` : ""}.${notes.length ? ` (${notes.join("; ")})` : ""}`,
      { last_plan_at },
    );
  }

  const stripeMode = await getStripeMode();
  const canPublish = !config.require_stripe_live || stripeMode === "live";
  if (!canPublish) notes.push("Stripe is TEST — publishing held until you go live");

  for (const f of ["red", "blue"] as Faction[]) {
    // 1) publish the oldest due post for this team (one per team per tick)
    if (canPublish) {
      const { data: due } = await db
        .from("agent_posts")
        .select("id,scheduled_for")
        .eq("faction", f)
        .eq("status", "queued")
        .lte("scheduled_for", started)
        .order("scheduled_for", { ascending: true })
        .limit(1);
      const d = due?.[0] as { id: number; scheduled_for: string } | undefined;
      if (d) {
        if (Date.now() - new Date(d.scheduled_for).getTime() > STALE_MS) {
          const slot = await nextSlot(db, f, config);
          await db.from("agent_posts").update({ scheduled_for: slot }).eq("id", d.id);
          notes.push(`#${d.id} was stale → rescheduled`);
        } else {
          try {
            await publishPost(db, d.id);
            published++;
          } catch (e) {
            const msg = e instanceof Error ? e.message : "failed";
            if (e instanceof NotReady) {
              // not an error: the clip is still rendering; try again next tick
              notes.push(`#${d.id} waiting for its clip`);
              await db.from("agent_posts").update({ last_error: `⏳ ${msg}` }).eq("id", d.id);
            } else {
              failed++;
              notes.push(`#${d.id}: ${msg}`);
              // back off 30 min and keep the error where the Commander can see it
              await db
                .from("agent_posts")
                .update({ last_error: msg, scheduled_for: new Date(Date.now() + 30 * 60_000).toISOString() })
                .eq("id", d.id);
            }
          }
        }
      }
    }

  }

  // 3) metrics, hourly
  let last_metrics_at = state.last_metrics_at;
  if (!last_metrics_at || Date.now() - new Date(last_metrics_at).getTime() > 60 * 60_000) {
    try {
      const n = await refreshMetrics(db);
      last_metrics_at = started;
      if (n) notes.push(`metrics refreshed on ${n}`);
    } catch {
      /* non-fatal */
    }
  }

  const summary =
    `published ${published}, drafted ${drafted}` +
    (failed ? `, ${failed} failed` : "") +
    (notes.length ? ` — ${notes.join("; ")}` : "");
  return save(summary, { last_metrics_at, last_plan_at });
}
