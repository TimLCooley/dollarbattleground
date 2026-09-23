import type { ReactNode } from "react";

// US Army-style rank ladder for Dollar Battleground.
// Points come from the FIELD, not dollars: flip a tile = 3 pts, report for
// duty (a return 8h+ apart) = 1 pt. Enlisted climb on that score. Officers are
// commissioned by a paid strike ($5+) and climb on the same score. Tunable.

export type InsigniaSpec =
  | { kind: "none" }
  | { kind: "chevron"; chevrons: number; rockers: number }
  | { kind: "bar"; bars: number; color: "gold" | "silver" }
  | { kind: "leaf"; color: "gold" | "silver" }
  | { kind: "eagle" }
  | { kind: "star"; stars: number };

export interface Rank {
  key: string;
  name: string; // display name (uppercased in UI)
  abbr: string;
  tier: "recruit" | "enlisted" | "officer";
  order: number; // global prestige order
  req: number; // min field points to hold this rank
  insignia: InsigniaSpec;
}

export const RECRUIT: Rank = {
  key: "recruit",
  name: "Recruit",
  abbr: "RCT",
  tier: "recruit",
  order: 0,
  req: 0,
  insignia: { kind: "none" },
};

// Enlisted climb by FIELD POINTS (flip a tile = 3, a return = 1). req is that
// score. First flip (3 pts) = Private; one return or another flip = PFC (4);
// then the curve steepens. order values leave room; enlisted 1-8, officers 9-18.
const ENLISTED: Rank[] = [
  { key: "pvt", name: "Private", abbr: "PVT", req: 3, chev: [1, 0] },
  { key: "pfc", name: "Private First Class", abbr: "PFC", req: 4, chev: [1, 1] },
  { key: "cpl", name: "Corporal", abbr: "CPL", req: 7, chev: [2, 0] },
  { key: "sgt", name: "Sergeant", abbr: "SGT", req: 13, chev: [3, 0] },
  { key: "ssg", name: "Staff Sergeant", abbr: "SSG", req: 20, chev: [3, 1] },
  { key: "sfc", name: "Sergeant First Class", abbr: "SFC", req: 30, chev: [3, 2] },
  { key: "msg", name: "Master Sergeant", abbr: "MSG", req: 46, chev: [3, 3] },
  { key: "sgm", name: "Sergeant Major", abbr: "SGM", req: 65, chev: [3, 3] },
].map((r, i) => ({
  key: r.key,
  name: r.name,
  abbr: r.abbr,
  tier: "enlisted" as const,
  order: 1 + i,
  req: r.req,
  insignia: { kind: "chevron" as const, chevrons: r.chev[0], rockers: r.chev[1] },
}));

// Officers are commissioned by a paid strike ($5 = ~18 pts), then climb on the
// same field points. 2LT is the auto entry; 1LT sits +1 past a $5 (so a return
// or an existing point or two lands you there fast); then it steepens to GEN.
const OFFICER: Rank[] = [
  { key: "2lt", name: "Second Lieutenant", abbr: "2LT", req: 0, ins: { kind: "bar", bars: 1, color: "gold" } },
  { key: "1lt", name: "First Lieutenant", abbr: "1LT", req: 19, ins: { kind: "bar", bars: 1, color: "silver" } },
  { key: "cpt", name: "Captain", abbr: "CPT", req: 34, ins: { kind: "bar", bars: 2, color: "silver" } },
  { key: "maj", name: "Major", abbr: "MAJ", req: 58, ins: { kind: "leaf", color: "gold" } },
  { key: "ltc", name: "Lieutenant Colonel", abbr: "LTC", req: 90, ins: { kind: "leaf", color: "silver" } },
  { key: "col", name: "Colonel", abbr: "COL", req: 130, ins: { kind: "eagle" } },
  { key: "bg", name: "Brigadier General", abbr: "BG", req: 180, ins: { kind: "star", stars: 1 } },
  { key: "mg", name: "Major General", abbr: "MG", req: 240, ins: { kind: "star", stars: 2 } },
  { key: "ltg", name: "Lieutenant General", abbr: "LTG", req: 310, ins: { kind: "star", stars: 3 } },
  { key: "gen", name: "General", abbr: "GEN", req: 400, ins: { kind: "star", stars: 4 } },
].map((r, i) => ({
  key: r.key,
  name: r.name,
  abbr: r.abbr,
  tier: "officer" as const,
  order: 9 + i,
  req: r.req,
  insignia: r.ins as InsigniaSpec,
}));

export const RANKS: Rank[] = [RECRUIT, ...ENLISTED, ...OFFICER];

function highest(list: Rank[], value: number): Rank {
  let out = list[0];
  for (const r of list) if (value >= r.req) out = r;
  return out;
}

// Field points: every tile you flip = 3 pts; every return (8h+ apart) = 1 pt.
// Not tied to dollars. `captures` is total tiles taken; `logins` is total
// sessions, so returns = logins beyond the first (the first isn't a "return").
export function progressOf(p: { captures?: number; logins?: number }): number {
  const flips = (p.captures ?? 0) * 3;
  const returns = Math.max(0, (p.logins ?? 1) - 1);
  return flips + returns;
}

export function rankFor(p: {
  placedFirst: boolean;
  isOfficer: boolean;
  captures?: number;
  logins?: number;
}): Rank {
  const progress = progressOf(p);
  if (p.isOfficer) return highest(OFFICER, progress);
  if (!p.placedFirst) return RECRUIT;
  return highest(ENLISTED, progress);
}

// The next rank up in the player's track and how many more points it needs.
export function nextRank(p: {
  isOfficer: boolean;
  captures?: number;
  logins?: number;
}): { rank: Rank; needed: number } | null {
  const progress = progressOf(p);
  const list = p.isOfficer ? OFFICER : ENLISTED;
  for (const r of list) {
    if (r.req > progress) return { rank: r, needed: r.req - progress };
  }
  return null; // top of the ladder
}

// ------------------------------ insignia icons ------------------------------
const GOLD = "var(--gold)";
const SILVER = "#c9d0d6";
const EDGE = "rgba(0,0,0,.32)";

function ChevronStack({ chevrons, rockers }: { chevrons: number; rockers: number }) {
  const unit = 17;
  const rows = chevrons + rockers;
  const startY = 60 - (rows * unit) / 2 + 6;
  const els: ReactNode[] = [];
  for (let i = 0; i < chevrons; i++) {
    const y = startY + i * unit;
    els.push(
      <polyline
        key={"c" + i}
        points={`22,${y + 16} 60,${y} 98,${y + 16}`}
        fill="none"
        stroke={GOLD}
        strokeWidth="11"
      />,
    );
  }
  for (let j = 0; j < rockers; j++) {
    const y = startY + (chevrons + j) * unit + 12;
    els.push(
      <path
        key={"r" + j}
        d={`M22 ${y} Q60 ${y + 16} 98 ${y}`}
        fill="none"
        stroke={GOLD}
        strokeWidth="11"
      />,
    );
  }
  return <>{els}</>;
}

function Bars({ n, color }: { n: number; color: string }) {
  const w = 15,
    gap = 12,
    h = 58,
    y = 31;
  const total = n * w + (n - 1) * gap;
  const x0 = 60 - total / 2;
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <rect
          key={i}
          x={x0 + i * (w + gap)}
          y={y}
          width={w}
          height={h}
          rx="2"
          fill={color}
          stroke={EDGE}
          strokeWidth="1.5"
        />
      ))}
    </>
  );
}

function starPoints(cx: number, cy: number, r: number) {
  const p: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    p.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return p.join(" ");
}

function Stars({ n }: { n: number }) {
  const r = n > 2 ? 15 : 20,
    gap = 6;
  const total = n * (2 * r) + (n - 1) * gap;
  const x0 = 60 - total / 2 + r;
  return (
    <>
      {Array.from({ length: n }, (_, i) => (
        <polygon
          key={i}
          points={starPoints(x0 + i * (2 * r + gap), 60, r)}
          fill={SILVER}
          stroke={EDGE}
          strokeWidth="1.5"
        />
      ))}
    </>
  );
}

function Leaf({ color }: { color: string }) {
  return (
    <>
      <path
        d="M60 20 C40 34 40 56 49 71 C53 81 56 88 60 96 C64 88 67 81 71 71 C80 56 80 34 60 20 Z"
        fill={color}
        stroke={EDGE}
        strokeWidth="1.5"
      />
      <path d="M60 30 L60 90" fill="none" stroke={EDGE} strokeWidth="1.5" />
    </>
  );
}

function Eagle() {
  return (
    <g fill={SILVER} stroke={EDGE} strokeWidth="1.5">
      <path d="M60 54 C42 46 26 47 14 60 C31 57 45 61 59 68 Z" />
      <path d="M60 54 C78 46 94 47 106 60 C89 57 75 61 61 68 Z" />
      <ellipse cx="60" cy="64" rx="7" ry="15" />
      <circle cx="60" cy="43" r="7" />
    </g>
  );
}

export function Insignia({ ins, size = 84 }: { ins: InsigniaSpec; size?: number }) {
  let inner: ReactNode = null;
  if (ins.kind === "chevron")
    inner = <ChevronStack chevrons={ins.chevrons} rockers={ins.rockers} />;
  else if (ins.kind === "bar")
    inner = <Bars n={ins.bars} color={ins.color === "silver" ? SILVER : GOLD} />;
  else if (ins.kind === "star") inner = <Stars n={ins.stars} />;
  else if (ins.kind === "leaf")
    inner = <Leaf color={ins.color === "silver" ? SILVER : GOLD} />;
  else if (ins.kind === "eagle") inner = <Eagle />;

  if (!inner) return null;
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className="insignia"
      aria-hidden="true"
    >
      {inner}
    </svg>
  );
}
