"use client";

import { useEffect, useState } from "react";

const TOTAL = 225;

function RadioIcon() {
  return (
    <svg
      className="fr-radio-ic"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="9" width="13" height="12" rx="1.5" />
      <path d="M11 9 L18 3" />
      <circle cx="18" cy="3" r="1.3" fill="currentColor" stroke="none" />
      <line x1="9" y1="13" x2="9" y2="17" />
      <circle cx="14" cy="15" r="2" />
    </svg>
  );
}

function titleCase(s: string): string {
  return s ? s.charAt(0) + s.slice(1).toLowerCase() : s;
}

function briefings(
  counts: { b: number; r: number },
  addr: string,
): { m: string; s: string }[] {
  const { b, r } = counts;
  const lead = b > r ? "Blue" : r > b ? "Red" : null;
  const trailing = lead === "Blue" ? "Red" : "Blue";
  const lead$ = Math.round((Math.max(b, r) / TOTAL) * 100);
  const list: { m: string; s: string }[] = [];
  if (!lead)
    list.push({
      m: `It's even. That won't last. Make your move, ${addr}.`,
      s: `${TOTAL} positions. Two sides. You decide what happens next.`,
    });
  else
    list.push({
      m: `${lead} leads at ${lead$}% — ${trailing} isn't done yet, ${addr}.`,
      s: `Every position counts. Take another.`,
    });
  list.push({
    m: `The board is live. Every flip is real, ${addr}.`,
    s: `${TOTAL} positions. Two sides.`,
  });
  list.push({
    m: `Reinforce your line or lose it, ${addr}.`,
    s: `Hesitation is how empires fall.`,
  });
  return list;
}

export function FieldRadio({
  counts,
  side,
  rank,
  flash,
}: {
  counts: { b: number; r: number };
  side: "red" | "blue";
  rank?: string;
  flash?: string | null;
}) {
  const [idx, setIdx] = useState(0);
  const [now, setNow] = useState<Date | null>(null);
  const [tmode, setTmode] = useState(0); // 0 = Zulu, 1 = UTC, 2 = local
  const [agentBrief, setAgentBrief] = useState<{ m: string; s: string } | null>(
    null,
  );

  // Ask the board_manager agent (Gemini) for a line about THIS player's live
  // situation. Best-effort — falls back to the canned briefings below.
  useEffect(() => {
    let alive = true;
    fetch("/api/agent/briefing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ side, rank }),
    })
      .then((r) => r.json())
      .then((d: { briefing?: { line: string; nudge: string } | null }) => {
        if (alive && d?.briefing) {
          setAgentBrief({ m: d.briefing.line, s: d.briefing.nudge });
          setIdx(0); // surface the live agent line the moment it arrives
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [side, rank]);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const t = window.setInterval(tick, 15000);
    return () => window.clearInterval(t);
  }, []);

  const pad = (n: number) => String(n).padStart(2, "0");
  const time = !now
    ? ""
    : tmode === 0
      ? `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}Z`
      : tmode === 1
        ? `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())} UTC`
        : now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const tlabel = tmode === 0 ? "Zulu" : tmode === 1 ? "UTC" : "local";

  useEffect(() => {
    const t = window.setInterval(() => setIdx((i) => i + 1), 8000);
    return () => window.clearInterval(t);
  }, []);

  // Auto-rotate the clock format (Zulu -> UTC -> local); tap still cycles too.
  useEffect(() => {
    const t = window.setInterval(() => setTmode((m) => (m + 1) % 3), 5000);
    return () => window.clearInterval(t);
  }, []);

  const addr = rank ? titleCase(rank) : "General";
  const canned = briefings(counts, addr);
  // The live agent line leads; canned briefings fill the rotation behind it.
  const list = agentBrief ? [agentBrief, ...canned] : canned;
  const brief = flash ? { m: flash, s: "" } : list[idx % list.length];

  return (
    <div className={"field-radio" + (flash ? " alert" : "")}>
      <div className="fr-top">
        <RadioIcon />
        <span className="fr-label">FIELD RADIO</span>
        <span className="fr-spacer" />
        <span className={"fr-source " + side}>
          <span className="fr-dot" aria-hidden="true" />
          {side.toUpperCase()} COMMAND
        </span>
        <button
          type="button"
          className="fr-time"
          onClick={() => setTmode((m) => (m + 1) % 3)}
          title={`${tlabel} time — tap to switch`}
        >
          {time}
        </button>
      </div>
      <button
        type="button"
        className="fr-body"
        onClick={() => setIdx((i) => i + 1)}
        aria-label="Next transmission"
      >
        <span className="fr-msg" key={brief.m}>
          {brief.m}
        </span>
        {brief.s && <span className="fr-sub">{brief.s}</span>}
        <span className="fr-next" aria-hidden="true">
          ›
        </span>
      </button>
    </div>
  );
}
