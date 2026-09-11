"use client";

import { useEffect, useMemo, useState } from "react";
import type { Team } from "./board";

const TOTAL = 225;
const pct = (v: number) => Math.round((v / TOTAL) * 100);

function buildLines(
  counts: { b: number; r: number; n: number },
  playerSide?: Team,
): string[] {
  const bp = pct(counts.b);
  const rp = pct(counts.r);
  const leader =
    counts.b > counts.r ? "BLUE" : counts.r > counts.b ? "RED" : "NOBODY";
  const lines = [
    `⚡ ${leader} is winning — Blue ${bp}% · Red ${rp}%`,
    `🟦 Blue commands ${counts.b} tiles`,
    `🟥 Red commands ${counts.r} tiles`,
    `${counts.n} tiles still open — grab them before they do`,
    `The board is LIVE. Every flip is real.`,
  ];
  if (playerSide) {
    const enemy = playerSide === "red" ? "Blue" : "Red";
    lines.push(
      `${enemy} is probing your lines, Captain — don't blink`,
      `Reinforce now or watch ${enemy} take the map`,
    );
  }
  return lines;
}

export function Announcer({
  counts,
  playerSide,
  threat,
}: {
  counts: { b: number; r: number; n: number };
  playerSide?: Team;
  threat?: string | null;
}) {
  const lines = useMemo(
    () => buildLines(counts, playerSide),
    [counts, playerSide],
  );
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setIdx((i) => i + 1), 4200);
    return () => window.clearInterval(t);
  }, []);

  const msg = threat ?? lines[idx % lines.length];

  return (
    <div className={"announcer" + (threat ? " threat" : "")} role="status">
      <span className="ann-dot" aria-hidden="true" />
      <span className="ann-text" key={msg}>
        {msg}
      </span>
    </div>
  );
}
