import "server-only";
import { cfgGet, cfgSet, type Db } from "@/lib/app-config";

// RobinReach: the bridge from the team clips to the founder's own feeds.
// X gets the agents' posts directly; TikTok gets the same clip re-captioned
// in the founder's voice ("I built this"). One REST call per clip; the
// switch and profile ids live in app_config.crosspost.

const API = "https://robinreach.com/api/v1";
const KEY = process.env.ROBINREACH_API_KEY;

export interface CrosspostConfig {
  tiktok: boolean;
  brand_id: string;
  tiktok_profile_id: number;
  founder_profile_ids: number[]; // where the founder's own clips go (TikTok by default)
}
const DEFAULTS: CrosspostConfig = { tiktok: false, brand_id: "a45588e3a3d18b3d", tiktok_profile_id: 15814, founder_profile_ids: [15814, 15815, 16861, 23144] };

export function isRobinReachConfigured(): boolean {
  return Boolean(KEY);
}

export async function getCrosspost(db: Db): Promise<CrosspostConfig> {
  return { ...DEFAULTS, ...((await cfgGet<Partial<CrosspostConfig>>(db, "crosspost")) ?? {}) };
}

export async function setCrosspost(db: Db, patch: Partial<CrosspostConfig>): Promise<CrosspostConfig> {
  const next = { ...(await getCrosspost(db)), ...patch };
  await cfgSet(db, "crosspost", next);
  return next;
}

// TikTok wants a hook first, the founder's voice, and a few hashtags — none
// of which the X copy carries. Keep the agents' line, add the frame.
export function tiktokCaption(faction: "red" | "blue", copy: string): { title: string; content: string } {
  const line = copy.replace(/\s*https?:\/\/\S+/g, "").replace(/\s*dollarbattleground\.com\S*/gi, "").trim();
  const side = faction === "red" ? "Red" : "Blue";
  const title = line.split(/[.!?]/)[0].slice(0, 80) || `${side} dispatch`;
  const content = `${line}\n\nI built this — a live map, Red vs Blue, one side wins. First position's free. dollarbattleground.com\n\n#indiegame #redvsblue #browsergame #gamedev #${side.toLowerCase()}team`;
  return { title, content };
}

async function rr(path: string, init: RequestInit & { brand: string }): Promise<Response> {
  const url = `${API}${path}${path.includes("?") ? "&" : "?"}brand_id=${encodeURIComponent(init.brand)}`;
  return fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${KEY}`, Accept: "application/json", "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

// Create as a draft, then publish — RobinReach validates on create and
// publishes in the background; we record its post id and check later.
export async function crosspostToTikTok(
  db: Db,
  post: { id: number; faction: "red" | "blue"; copy: string; media_url: string },
): Promise<{ ok: boolean; postId?: number; error?: string }> {
  const cfg = await getCrosspost(db);
  return publishViaRobinReach(db, { ...post, profileIds: [cfg.tiktok_profile_id], labels: ["battleground", post.faction], ...tiktokCaption(post.faction, post.copy) });
}

// The founder's own clip: the caption is already written for TikTok.
export async function publishFounderClip(
  db: Db,
  post: { id: number; copy: string; media_url: string },
): Promise<{ ok: boolean; postId?: number; error?: string }> {
  const cfg = await getCrosspost(db);
  const title = post.copy.split("\n")[0].split(/[.!?]/)[0].slice(0, 80) || "Founder's log";
  return publishViaRobinReach(db, { ...post, profileIds: cfg.founder_profile_ids, labels: ["battleground", "founder"], title, content: post.copy });
}

async function publishViaRobinReach(
  db: Db,
  post: { id: number; media_url: string; profileIds: number[]; labels: string[]; title: string; content: string },
): Promise<{ ok: boolean; postId?: number; error?: string }> {
  if (!KEY) return { ok: false, error: "ROBINREACH_API_KEY not set" };
  const cfg = await getCrosspost(db);
  const { title, content } = post;
  try {
    const created = await rr("/posts", {
      brand: cfg.brand_id,
      method: "POST",
      body: JSON.stringify({
        content,
        media_urls: [post.media_url],
        social_profile_ids: post.profileIds,
        status: "draft",
        publish_time: new Date(Date.now() + 60_000).toISOString(),
        timezone: "UTC",
        labels: post.labels,
        platform_options: {
          tiktok: { title, content, privacy: "PUBLIC_TO_EVERYONE", is_aigc: true },
          // The founder's clip can also go to his personal X and Instagram:
          // X takes a ≤280 cut of the caption; Instagram publishes video as a Reel.
          twitter: { content: content.length > 280 ? content.slice(0, 277).replace(/\s+\S*$/, "") + "…" : content },
          instagram: { post_type: "reels", content },
          // A vertical clip under a minute lands as a YouTube Short; title is required.
          youtube: { title: title.slice(0, 100), content, privacy: "public" },
        },
      }),
    });
    const cj = (await created.json().catch(() => ({}))) as { post_id?: number; errors?: string[]; error?: string };
    if (!created.ok || !cj.post_id) {
      const error = (cj.errors ?? [cj.error ?? `HTTP ${created.status}`]).join("; ");
      await db.from("agent_posts").update({ tiktok_error: error }).eq("id", post.id);
      return { ok: false, error };
    }
    const pub = await rr(`/posts/${cj.post_id}/publish_now`, { brand: cfg.brand_id, method: "POST" });
    if (!pub.ok) {
      const error = `created #${cj.post_id} but publish_now → HTTP ${pub.status}`;
      await db.from("agent_posts").update({ tiktok_post_id: cj.post_id, tiktok_error: error }).eq("id", post.id);
      return { ok: false, postId: cj.post_id, error };
    }
    await db.from("agent_posts").update({ tiktok_post_id: cj.post_id, tiktok_at: new Date().toISOString(), tiktok_error: null }).eq("id", post.id);
    return { ok: true, postId: cj.post_id };
  } catch (e) {
    const error = e instanceof Error ? e.message : "crosspost failed";
    await db.from("agent_posts").update({ tiktok_error: error }).eq("id", post.id);
    return { ok: false, error };
  }
}
