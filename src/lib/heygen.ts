import "server-only";
import { assertWithinBudget, estimateCostUsd, recordRender } from "./heygen-budget";

// HeyGen client (v3). Server-only: reads the secret API key, never import into
// client code. The API key bills HeyGen's pay-as-you-go API WALLET (USD), which
// is separate from the web subscription's monthly credits. Every render goes
// through the budget guard first, so we can never blow past the caps or wallet.

const KEY = process.env.HEYGEN_API_KEY;
const BASE = "https://api.heygen.com";

export function isHeygenConfigured(): boolean {
  return Boolean(KEY);
}

async function hg(path: string, init?: RequestInit) {
  if (!KEY) throw new Error("HEYGEN_API_KEY not set");
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      "X-Api-Key": KEY,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.error) {
    throw new Error(json?.error?.message || json?.message || `HeyGen ${res.status}`);
  }
  return json;
}

// The hard ceiling: the API wallet balance in USD. auto_reload off = renders
// simply fail when it hits $0 (no surprise charges).
export async function getWallet(): Promise<{ balance: number; currency: string }> {
  const j = await hg("/v3/users/me");
  const w = j?.data?.wallet ?? {};
  return { balance: Number(w.remaining_balance ?? 0), currency: String(w.currency ?? "usd") };
}

export interface RenderRequest {
  script: string;
  avatarId: string;
  voiceId: string;
  seconds?: number; // duration estimate, used for budgeting (default 8s)
  agent?: string; // e.g. "war-correspondent"
  kind?: string; // e.g. "red-anchor"
  background?: { type: "transparent" } | { type: "color"; value: string };
  width?: number;
  height?: number;
}

// Generate a talking-avatar video. BUDGET-GUARDED: throws BEFORE spending if the
// render would exceed the daily cap, monthly cap, or wallet balance.
export async function generateVideo(
  req: RenderRequest,
): Promise<{ videoId: string; estCostUsd: number }> {
  const estCostUsd = estimateCostUsd(req.seconds ?? 8);
  await assertWithinBudget(estCostUsd); // fail-closed: nothing is spent if this throws

  const body = {
    video_inputs: [
      {
        character: { type: "avatar", avatar_id: req.avatarId },
        voice: { type: "text", input_text: req.script, voice_id: req.voiceId },
        background: req.background ?? { type: "color", value: "#0a0f1e" },
      },
    ],
    dimension: { width: req.width ?? 1280, height: req.height ?? 720 },
  };
  const j = await hg("/v3/videos", { method: "POST", body: JSON.stringify(body) });
  const videoId = j?.data?.video_id ?? j?.data?.id ?? "";
  // Log the render at its estimated cost (reconciled against wallet delta later).
  await recordRender({
    externalId: videoId,
    agent: req.agent,
    kind: req.kind,
    seconds: req.seconds,
    costUsd: estCostUsd,
    status: "queued",
  });
  return { videoId, estCostUsd };
}

export async function getVideoStatus(
  videoId: string,
): Promise<{ status: string; url?: string }> {
  const j = await hg(`/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`);
  const d = j?.data ?? {};
  return { status: d.status ?? "unknown", url: d.video_url };
}
