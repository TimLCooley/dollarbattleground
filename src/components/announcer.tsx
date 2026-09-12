"use client";

import { useEffect, useState } from "react";

// Top status bar: live tile counts that rotate between raw count and %, with
// event flashes (threats/promotions) briefly taking over the whole bar.
export function Announcer({
  counts,
  threat,
}: {
  counts: { b: number; r: number; n: number };
  playerSide?: unknown; // (unused; kept for call-site compatibility)
  threat?: string | null;
}) {
  const [showPct, setShowPct] = useState(false);

  useEffect(() => {
    const t = window.setInterval(() => setShowPct((p) => !p), 3500);
    return () => window.clearInterval(t);
  }, []);

  if (threat) {
    return (
      <div className="statusbar alert" role="status">
        <span className="sb-dot" aria-hidden="true" />
        <span className="sb-flash" key={threat}>
          {threat}
        </span>
      </div>
    );
  }

  const total = counts.b + counts.r + counts.n || 1;
  const fmt = (v: number) => (showPct ? `${Math.round((v / total) * 100)}%` : v);
  const mode = showPct ? "p" : "n";

  return (
    <div className="statusbar" role="status">
      <span className="sb-seg">
        <span className="sb-swatch blue" aria-hidden="true" />
        BLUE COMMANDS{" "}
        <span className="sb-val" key={"b" + mode}>
          {fmt(counts.b)}
        </span>
      </span>
      <span className="sb-div" aria-hidden="true" />
      <span className="sb-seg">
        <span className="sb-swatch red" aria-hidden="true" />
        RED COMMANDS{" "}
        <span className="sb-val" key={"r" + mode}>
          {fmt(counts.r)}
        </span>
      </span>
      <span className="sb-arrows" aria-hidden="true">
        ›››
      </span>
    </div>
  );
}
