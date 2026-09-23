import "server-only";

// Turns a video post into the MP4 to upload. Clips are pre-rendered by the
// producer worker (scripts/produce-clip.mjs) and hosted in Supabase Storage;
// publishing just fetches the hosted file. No fallbacks: a video post with
// nothing rendered goes out as text (the autopilot decides when).

export interface Produced {
  bytes: Uint8Array;
  url: string;
}

export async function produceVideo(_videoKind: string | null, mediaUrl?: string | null): Promise<Produced | null> {
  if (!mediaUrl) return null;
  const res = await fetch(mediaUrl);
  if (!res.ok) return null;
  return { bytes: new Uint8Array(await res.arrayBuffer()), url: mediaUrl };
}
