"use client";

// Meta Pixel (Tim's, 2026-10-16). Page views + the moments that matter for ads.
// Admin play-as (?as=) never fires.
export const META_PIXEL_ID = "2060324007952684";

type Fbq = (...args: unknown[]) => void;

export function pixel(event: string, params?: Record<string, unknown>, custom = false) {
  if (typeof window === "undefined") return;
  if (new URLSearchParams(window.location.search).get("as")) return;
  const w = window as unknown as { fbq?: Fbq; __pxq?: unknown[][] };
  const args = [custom ? "trackCustom" : "track", event, params ?? {}];
  // the pixel script loads after the page is interactive — hold early events until it's ready
  if (!w.fbq) {
    (w.__pxq ??= []).push(args);
    return;
  }
  try {
    w.fbq(...args);
  } catch {
    /* never break the game for analytics */
  }
}
