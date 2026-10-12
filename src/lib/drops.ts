"use client";

import { createClient } from "@/utils/supabase/client";

// Drops: the server rolls the dice; the board picks the new drop up in realtime.
function visitId(): string | null {
  try {
    let v = sessionStorage.getItem("bg_visit");
    if (!v) {
      v = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem("bg_visit", v);
    }
    return v;
  } catch {
    return null;
  }
}

export function rollDrop(event: "open" | "placement") {
  if (typeof window === "undefined") return;
  if (new URLSearchParams(window.location.search).get("as")) return;
  const v = visitId();
  if (!v) return;
  createClient()
    .rpc("roll_drop", { p_visit: v, p_event: event })
    .then(() => {}, () => {});
}
