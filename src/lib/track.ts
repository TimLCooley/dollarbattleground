"use client";

import { createClient } from "@/utils/supabase/client";

// Funnel tracking: one event per browser session per step, so the scoreboard
// can show where real people drop off. Fire-and-forget; never blocks the game.
export type FunnelStep = "board_open" | "square_tap" | "side_pick" | "email_entered" | "code_verified" | "first_move" | "feedback_open" | "commander_open" | "commander_submit" | "commander_share";

function sessionId(): string | null {
  try {
    let id = localStorage.getItem("bg_session");
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      localStorage.setItem("bg_session", id);
    }
    return id;
  } catch {
    return null;
  }
}

export function track(step: FunnelStep, meta?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (new URLSearchParams(window.location.search).get("as")) return; // admin play-as isn't a visitor
  const sid = sessionId();
  if (!sid) return;
  createClient()
    .rpc("track", { p_session: sid, p_step: step, p_meta: meta ?? null })
    .then(() => {}, () => {});
}
