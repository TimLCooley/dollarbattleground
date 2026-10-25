"use client";

import { createClient } from "@/utils/supabase/client";
import { pixel } from "@/lib/pixel";

// Funnel tracking: one event per browser session per step, so the scoreboard
// can show where real people drop off. Fire-and-forget; never blocks the game.
export type FunnelStep = "board_open" | "square_tap" | "side_pick" | "email_entered" | "code_verified" | "first_move" | "feedback_open" | "commander_open" | "commander_play" | "commander_submit" | "commander_share" | "store_open" | "store_checkout" | "store_purchase";

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
  // the same moments go to the Meta Pixel (ads optimize on real players, not visits)
  if (step === "commander_open") pixel("ViewContent", { content_name: "Commander", ...(meta ?? {}) });
  else if (step === "commander_submit") pixel("CommanderScore", meta, true);
  else if (step === "commander_share") pixel("CommanderShare", meta, true);
  else if (step === "code_verified") pixel("CompleteRegistration", { content_name: "enlisted" });
  else if (step === "first_move") pixel("BattlegroundFirstMove", meta, true);
  else if (step === "store_checkout") pixel("InitiateCheckout", { content_name: String(meta?.item ?? "") });
  else if (step === "store_purchase") pixel("Purchase", { content_name: String(meta?.item ?? ""), value: Number(meta?.value ?? 0), currency: "USD" });
  const sid = sessionId();
  if (!sid) return;
  createClient()
    .rpc("track", { p_session: sid, p_step: step, p_meta: meta ?? null })
    .then(() => {}, () => {});
}
