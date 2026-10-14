"use client";

import { useEffect } from "react";

// When a new deploy goes live, open tabs reload themselves — but never while
// the player is in a dialog (typing an email, a code, feedback…).
export function VersionWatch() {
  useEffect(() => {
    let loaded: string | null = null;
    let pending = false;
    let alive = true;

    const busy = () => !!document.querySelector('[role="dialog"]') || document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA";
    const reloadWhenIdle = () => {
      if (!alive) return;
      if (busy()) window.setTimeout(reloadWhenIdle, 5000);
      else window.location.reload();
    };
    const check = async () => {
      if (pending || document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const { v } = (await r.json()) as { v: string };
        if (!loaded) loaded = v;
        else if (v !== loaded) {
          pending = true;
          reloadWhenIdle();
        }
      } catch {
        /* offline — try again later */
      }
    };

    check();
    const t = window.setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      alive = false;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return null;
}
