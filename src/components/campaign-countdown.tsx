"use client";

import { useEffect, useState } from "react";

// "N days left to join the founding class" — the recruiting campaign's live
// countdown, shown on the claim and sign-in screens. Reads the public
// /api/campaign endpoint; renders nothing when no campaign is running.

export function CampaignCountdown({ side }: { side?: "red" | "blue" | null }) {
  const [days, setDays] = useState<number | null>(null);
  useEffect(() => {
    fetch("/api/campaign")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.active && setDays(d.daysLeft))
      .catch(() => {});
  }, []);
  if (days == null) return null;
  const who = side === "red" ? "Red's" : side === "blue" ? "Blue's" : "the";
  return (
    <p className="ob-countdown" aria-live="polite">
      ⏳ <b>{days}</b> day{days === 1 ? "" : "s"} left to join {who} founding class
    </p>
  );
}
