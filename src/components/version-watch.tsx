"use client";

import { useEffect } from "react";

// When a new deploy goes live, open tabs reload themselves — but never while
// the player is typing (an email, a code, feedback…). Same when a new day's
// puzzle starts (midnight Mountain) on today's map: a tab left open overnight
// moves on to the new board instead of showing yesterday's.
export function VersionWatch() {
  useEffect(() => {
    let loaded: string | null = null;
    let pending = false;
    let alive = true;
    const mtDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(new Date());
    const startDay = mtDay();
    const onToday = () => window.location.pathname === "/" && !new URLSearchParams(window.location.search).has("day");

    const busy = () =>
      !!document.querySelector('[role="dialog"] input, [role="dialog"] textarea') ||
      document.activeElement?.tagName === "INPUT" ||
      document.activeElement?.tagName === "TEXTAREA";
    const reloadWhenIdle = () => {
      if (!alive) return;
      if (busy()) window.setTimeout(reloadWhenIdle, 5000);
      else window.location.reload();
    };
    const check = async () => {
      // the first call records which deploy this page loaded with, even in a background tab
      if (pending || (loaded && document.visibilityState !== "visible")) return;
      if (onToday() && mtDay() !== startDay) {
        pending = true;
        return reloadWhenIdle();
      }
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
