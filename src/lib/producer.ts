import "server-only";

// Turns a video post into an actual MP4 to upload. The "coming_soon" teaser is
// evergreen — pre-rendered once and hosted in Supabase Storage, so publishing is
// instant. Per-event "social_clip" videos (HeyGen anchor + Remotion) need
// on-demand rendering, which isn't wired to serverless yet — those fall back to
// text until the render worker/Lambda is in.

const TEASER_URL =
  process.env.COMING_SOON_MP4_URL ||
  "https://lvbcgzvbvmusqgjlzimb.supabase.co/storage/v1/object/public/media/coming-soon.mp4";

export interface Produced {
  bytes: Uint8Array;
  url: string;
}

export async function produceVideo(
  videoKind: string | null,
  mediaUrl?: string | null,
): Promise<Produced | null> {
  // Pre-rendered clip (the producer worker pulls data → renders → hosts → sets
  // media_url). Publish just uploads it.
  const url = mediaUrl || (videoKind === "coming_soon" ? TEASER_URL : null);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  return { bytes: new Uint8Array(await res.arrayBuffer()), url };
}
