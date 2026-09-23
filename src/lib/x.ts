import "server-only";
import crypto from "crypto";

// X (Twitter) posting via OAuth 1.0a. App-per-account model: each faction owns
// its own X app, so it has its own consumer key/secret AND access token/secret.
// Post as a faction by signing with that faction's four credentials.

export type Faction = "red" | "blue";

interface Creds {
  apiKey: string;
  apiSecret: string;
  token: string;
  secret: string;
}

function credsFor(faction: Faction): Creds | null {
  const F = faction.toUpperCase();
  const apiKey = process.env[`X_${F}_API_KEY`];
  const apiSecret = process.env[`X_${F}_API_SECRET`];
  const token = process.env[`X_${F}_TOKEN`];
  const secret = process.env[`X_${F}_SECRET`];
  if (apiKey && apiSecret && token && secret) return { apiKey, apiSecret, token, secret };
  return null;
}

export function xConfigured(faction: Faction): boolean {
  return credsFor(faction) !== null;
}

// RFC 3986 percent-encoding (stricter than encodeURIComponent).
function pct(s: string): string {
  return encodeURIComponent(s).replace(
    /[!*'()]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

// Build the OAuth 1.0a Authorization header. `params` are the oauth_* params
// that participate in the signature (JSON bodies are NOT signed).
function authHeader(
  method: string,
  url: string,
  params: Record<string, string>,
  apiSecret: string,
  tokenSecret: string,
): string {
  const baseString = [
    method.toUpperCase(),
    pct(url),
    pct(
      Object.keys(params)
        .sort()
        .map((k) => `${pct(k)}=${pct(params[k])}`)
        .join("&"),
    ),
  ].join("&");
  const signingKey = `${pct(apiSecret)}&${pct(tokenSecret)}`;
  const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");
  const all: Record<string, string> = { ...params, oauth_signature: signature };
  return (
    "OAuth " +
    Object.keys(all)
      .filter((k) => k.startsWith("oauth_"))
      .sort()
      .map((k) => `${pct(k)}="${pct(all[k])}"`)
      .join(", ")
  );
}

function baseOauth(apiKey: string, token: string): Record<string, string> {
  return {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: token,
    oauth_version: "1.0",
  };
}

// Post a tweet as a faction account — or, with `replyTo`, a reply to one of
// its own posts (how the link goes in the first comment, not the post).
export async function postTweet(
  faction: Faction,
  text: string,
  replyTo?: string,
): Promise<{ id: string; text: string }> {
  const c = credsFor(faction);
  if (!c) {
    throw new Error(
      `${faction} not configured — set X_${faction.toUpperCase()}_API_KEY/_API_SECRET/_TOKEN/_SECRET.`,
    );
  }
  const url = "https://api.twitter.com/2/tweets";
  const params = baseOauth(c.apiKey, c.token); // JSON body is not part of the signature
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader("POST", url, params, c.apiSecret, c.secret),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, ...(replyTo ? { reply: { in_reply_to_tweet_id: replyTo } } : {}) }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    data?: { id: string; text: string };
    detail?: string;
    title?: string;
  };
  if (!res.ok || !data.data) {
    throw new Error(`tweet ${res.status}: ${data.detail || data.title || JSON.stringify(data)}`);
  }
  return data.data;
}

// Identity check: which X account do this faction's credentials actually post
// as? Catches expired tokens and the one-app trap (a dev-portal token always
// belongs to the app owner, so "Blue" can silently post as Red).
export async function whoAmI(
  faction: Faction,
): Promise<{ id: string; username: string; name: string }> {
  const c = credsFor(faction);
  if (!c) throw new Error(`${faction} not configured`);
  const url = "https://api.twitter.com/2/users/me";
  const res = await fetch(url, {
    headers: { Authorization: authHeader("GET", url, baseOauth(c.apiKey, c.token), c.apiSecret, c.secret) },
  });
  const data = (await res.json().catch(() => ({}))) as {
    data?: { id: string; username: string; name: string };
    detail?: string;
    title?: string;
  };
  if (!res.ok || !data.data) {
    throw new Error(`users/me ${res.status}: ${data.detail || data.title || JSON.stringify(data)}`);
  }
  return data.data;
}

export interface TweetMetrics {
  impressions: number;
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
}

// Fetch public metrics (impressions/likes/reposts/replies/quotes) for up to 100
// tweet ids, signed as the faction. GET query params ARE part of the signature.
export async function getTweetMetrics(
  faction: Faction,
  ids: string[],
): Promise<Record<string, TweetMetrics>> {
  const c = credsFor(faction);
  if (!c || ids.length === 0) return {};
  const base = "https://api.twitter.com/2/tweets";
  const query: Record<string, string> = { ids: ids.slice(0, 100).join(","), "tweet.fields": "public_metrics" };
  const params = { ...baseOauth(c.apiKey, c.token), ...query };
  const auth = authHeader("GET", base, params, c.apiSecret, c.secret);
  const url = `${base}?${Object.entries(query).map(([k, v]) => `${pct(k)}=${pct(v)}`).join("&")}`;
  const res = await fetch(url, { headers: { Authorization: auth } });
  const data = (await res.json().catch(() => ({}))) as {
    data?: { id: string; public_metrics?: Record<string, number> }[];
  };
  const out: Record<string, TweetMetrics> = {};
  for (const t of data.data ?? []) {
    const m = t.public_metrics ?? {};
    out[t.id] = {
      impressions: m.impression_count ?? 0,
      likes: m.like_count ?? 0,
      reposts: m.retweet_count ?? 0,
      replies: m.reply_count ?? 0,
      quotes: m.quote_count ?? 0,
    };
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const UPLOAD = "https://upload.twitter.com/1.1/media/upload.json";

// Upload a video to X via the chunked media API (INIT → APPEND → FINALIZE →
// poll STATUS) and return its media_id, ready to attach to a tweet.
export async function uploadVideo(faction: Faction, bytes: Uint8Array): Promise<string> {
  const c = credsFor(faction);
  if (!c) throw new Error(`${faction} not configured`);
  const oauth = () => baseOauth(c.apiKey, c.token);

  // INIT (form-urlencoded params ARE part of the signature)
  const initP = {
    command: "INIT",
    total_bytes: String(bytes.length),
    media_type: "video/mp4",
    media_category: "tweet_video",
  };
  const initRes = await fetch(UPLOAD, {
    method: "POST",
    headers: {
      Authorization: authHeader("POST", UPLOAD, { ...oauth(), ...initP }, c.apiSecret, c.secret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(initP).toString(),
  });
  const initData = (await initRes.json().catch(() => ({}))) as { media_id_string?: string; errors?: unknown };
  const mediaId = initData.media_id_string;
  if (!mediaId) throw new Error(`INIT failed: ${JSON.stringify(initData)}`);

  // APPEND in ≤4MB chunks (multipart body is NOT signed — only oauth params)
  const CHUNK = 4 * 1024 * 1024;
  let segment = 0;
  for (let off = 0; off < bytes.length; off += CHUNK, segment++) {
    const form = new FormData();
    form.append("command", "APPEND");
    form.append("media_id", mediaId);
    form.append("segment_index", String(segment));
    form.append("media", new Blob([bytes.subarray(off, off + CHUNK) as unknown as BlobPart]), "chunk");
    const res = await fetch(UPLOAD, {
      method: "POST",
      headers: { Authorization: authHeader("POST", UPLOAD, oauth(), c.apiSecret, c.secret) },
      body: form,
    });
    if (!res.ok) throw new Error(`APPEND ${segment} failed: ${res.status} ${await res.text()}`);
  }

  // FINALIZE
  const finP = { command: "FINALIZE", media_id: mediaId };
  const finRes = await fetch(UPLOAD, {
    method: "POST",
    headers: {
      Authorization: authHeader("POST", UPLOAD, { ...oauth(), ...finP }, c.apiSecret, c.secret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(finP).toString(),
  });
  let fin = (await finRes.json().catch(() => ({}))) as {
    processing_info?: { state?: string; check_after_secs?: number; error?: { message?: string } };
  };

  // Poll STATUS until the video is processed
  let info = fin.processing_info;
  for (let i = 0; info && info.state !== "succeeded" && i < 30; i++) {
    if (info.state === "failed") throw new Error(`media processing failed: ${info.error?.message ?? ""}`);
    await sleep((info.check_after_secs ?? 2) * 1000);
    const stP = { command: "STATUS", media_id: mediaId };
    const url = `${UPLOAD}?${new URLSearchParams(stP).toString()}`;
    const sRes = await fetch(url, {
      headers: { Authorization: authHeader("GET", UPLOAD, { ...oauth(), ...stP }, c.apiSecret, c.secret) },
    });
    fin = (await sRes.json().catch(() => ({}))) as typeof fin;
    info = fin.processing_info;
  }
  return mediaId;
}

// Post a tweet with an attached media_id.
export async function postTweetWithMedia(
  faction: Faction,
  text: string,
  mediaId: string,
): Promise<{ id: string; text: string }> {
  const c = credsFor(faction);
  if (!c) throw new Error(`${faction} not configured`);
  const url = "https://api.twitter.com/2/tweets";
  const params = baseOauth(c.apiKey, c.token);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader("POST", url, params, c.apiSecret, c.secret),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, media: { media_ids: [mediaId] } }),
  });
  const data = (await res.json().catch(() => ({}))) as { data?: { id: string; text: string }; detail?: string };
  if (!res.ok || !data.data) throw new Error(`tweet ${res.status}: ${data.detail || JSON.stringify(data)}`);
  return data.data;
}
