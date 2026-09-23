"use client";

// Single source of truth for flip effects — used by BOTH the Flip Lab
// (/admin/fx) and the live game board. Edit an effect or the per-tier pick here
// (or the speed via the Lab slider) and it changes in both places.
//
// The effect CSS lives in the Lab's stylesheet; importing it here means any
// screen that renders these effects (the board included) gets the styles.
import { useEffect, useRef, useState } from "react";
import "@/app/admin/fx/fx.css";

export type Side = "blue" | "red";
export type Level = "small" | "big" | "mega";

export type Proj =
  | "rocket"
  | "bomb"
  | "meteor"
  | "mortar"
  | "lightning"
  | "tank"
  | "barrage"
  | "laser"
  | "nuke"
  | "carpet"
  | "napalm"
  | "drone"
  | "artillery"
  | "flag";

export const colorVar = (s: Side) => (s === "red" ? "var(--red)" : "var(--blue)");

// ---- which effect each price tier fires (the game reads this) ----------------
export type Tier = "$1" | "$5" | "$10";
export interface TierFx {
  proj: Proj | null; // null = instant flip pop (the $1 single, great as-is)
  impactMs: number;
  mega?: boolean;
}
export const TIER_FX: Record<Tier, TierFx> = {
  $1: { proj: null, impactMs: 0 },
  $5: { proj: "barrage", impactMs: 440 },
  $10: { proj: "artillery", impactMs: 620, mega: true },
};

// ---- speed knob (Lab slider writes it; board reads it) -----------------------
const SPEED_KEY = "fx_speed_v1";
export function getFxSpeed(): number {
  try {
    const v = Number(localStorage.getItem(SPEED_KEY));
    return v > 0 ? v : 1;
  } catch {
    return 1;
  }
}
export function setFxSpeed(v: number) {
  try {
    localStorage.setItem(SPEED_KEY, String(v));
    window.dispatchEvent(new CustomEvent("fx:speed", { detail: v }));
  } catch {
    /* ignore */
  }
}
export function useFxSpeed(): number {
  const [s, setS] = useState(1);
  useEffect(() => {
    setS(getFxSpeed());
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setS(typeof d === "number" ? d : getFxSpeed());
    };
    window.addEventListener("fx:speed", on);
    return () => window.removeEventListener("fx:speed", on);
  }, []);
  return s;
}

// ---- geometry / hit computation ---------------------------------------------
function randVec(min: number, span: number, rotate: boolean) {
  const a = Math.random() * Math.PI * 2;
  const d = min + Math.random() * span;
  const x = Math.cos(a) * d;
  const y = Math.sin(a) * d;
  const rot = rotate ? (Math.atan2(-y, -x) * 180) / Math.PI + 45 : 0;
  return { x, y, rot };
}

export interface Hit {
  ex: number;
  ey: number;
  delay: number;
  level: Level;
  blast: "boom" | "fire";
  mega?: boolean;
  from?: { x: number; y: number; rot: number };
}
export const CELL = 22; // ~ one board cell, so spread lands on neighbors

export function computeHits(proj: Proj): Hit[] {
  if (proj === "rocket")
    return [{ ex: 0, ey: 0, delay: 0, level: "big", blast: "boom", from: randVec(150, 70, true) }];
  if (proj === "meteor")
    return [{ ex: 0, ey: 0, delay: 0, level: "big", blast: "boom", from: randVec(150, 70, false) }];
  if (proj === "nuke")
    return [{ ex: 0, ey: 0, delay: 0, level: "mega", blast: "boom", mega: true }];
  if (proj === "carpet" || proj === "napalm") {
    const blast: "boom" | "fire" = proj === "napalm" ? "fire" : "boom";
    const s = CELL;
    const u = CELL * 0.72;
    return [
      { ex: 0, ey: 0, delay: 0, level: "big", blast, mega: proj === "carpet" },
      { ex: -s, ey: -u, delay: 130, level: "big", blast },
      { ex: s, ey: -u, delay: 130, level: "big", blast },
      { ex: -2 * s, ey: -2 * u, delay: 260, level: "big", blast },
      { ex: 2 * s, ey: -2 * u, delay: 260, level: "big", blast },
    ];
  }
  if (proj === "drone") {
    return Array.from({ length: 11 }, () => {
      const ang = Math.random() * Math.PI * 2;
      const r = CELL * (0.5 + Math.random() * 2);
      return {
        ex: Math.cos(ang) * r,
        ey: Math.sin(ang) * r * 0.8,
        delay: Math.random() * 300,
        level: "small" as Level,
        blast: "boom" as const,
        from: randVec(120, 90, true),
      };
    });
  }
  if (proj === "artillery") {
    return Array.from({ length: 7 }, (_, i) => {
      const ang = Math.random() * Math.PI * 2;
      const r = CELL * (0.4 + Math.random() * 2.1);
      return {
        ex: Math.cos(ang) * r,
        ey: Math.sin(ang) * r * 0.8,
        delay: i * 100,
        level: "big" as Level,
        blast: "boom" as const,
      };
    });
  }
  if (proj === "laser") {
    return [
      { ex: 0, ey: 0, delay: 0, level: "big", blast: "boom", mega: true },
      { ex: -CELL * 1.8, ey: 0, delay: 90, level: "big", blast: "boom" },
      { ex: CELL * 1.8, ey: 0, delay: 90, level: "big", blast: "boom" },
    ];
  }
  return [{ ex: 0, ey: 0, delay: 0, level: proj === "flag" ? "small" : "big", blast: "boom" }];
}

const PROJ_EMOJI: Record<string, string> = {
  rocket: "🚀",
  bomb: "💣",
  meteor: "☄️",
  mortar: "💣",
  lightning: "⚡",
  napalm: "🔥",
  flag: "🪂",
};

export interface Bit {
  id: number;
  tx: number;
  ty: number;
  rot: number;
  sz: number;
  c: string;
}
export function makeBits(side: Side, level: Level): Bit[] {
  const team = colorVar(side);
  const n = level === "mega" ? 34 : level === "big" ? 20 : 13;
  const base = level === "mega" ? 70 : level === "big" ? 42 : 26;
  const spread = level === "mega" ? 95 : level === "big" ? 55 : 40;
  const bits: Bit[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    const dist = base + Math.random() * spread;
    const r = Math.random();
    let c = team;
    if (level !== "small") {
      c = r < 0.25 ? "#ff7a1a" : r < 0.4 ? "#ffd23b" : r < 0.55 ? "#fff" : team;
    } else {
      c = r < 0.12 ? "#fff" : r < 0.25 ? "var(--gold)" : team;
    }
    bits.push({
      id: i,
      tx: Math.cos(ang) * dist,
      ty: Math.sin(ang) * dist,
      rot: Math.random() * 720 - 360,
      sz: (r < 0.3 ? 3 : 5) + Math.random() * (level === "mega" ? 6 : 4),
      c,
    });
  }
  return bits;
}

export function renderProjectile(proj: Proj, id: number, hits: Hit[]) {
  if ((proj === "rocket" || proj === "meteor") && hits[0]?.from) {
    const v = hits[0].from;
    const emoji = proj === "rocket" ? "🚀" : "☄️";
    return (
      <div
        key={id}
        className="fx-proj fly"
        style={{ "--fx": `${v.x}px`, "--fy": `${v.y}px`, "--rot": `${v.rot}deg` } as React.CSSProperties}
      >
        {emoji}
      </div>
    );
  }
  if (proj === "drone") {
    return (
      <div key={id} className="fx-carpet">
        {hits.map((h, i) =>
          h.from ? (
            <span
              key={i}
              className="fx-proj fly"
              style={
                {
                  "--fx": `${h.from.x}px`,
                  "--fy": `${h.from.y}px`,
                  "--rot": `${h.from.rot}deg`,
                  "--ex": `${h.ex}px`,
                  "--ey": `${h.ey}px`,
                  fontSize: "15px",
                  animationDuration: "0.46s",
                  animationDelay: `${h.delay}ms`,
                } as React.CSSProperties
              }
            >
              🚀
            </span>
          ) : null,
        )}
      </div>
    );
  }
  if (proj === "carpet" || proj === "napalm") {
    const e = proj === "napalm" ? "🔥" : "💣";
    return (
      <div key={id} className="fx-carpet">
        {hits.map((h, i) => (
          <span
            key={i}
            className="fx-proj drop"
            style={{ "--ex": `${h.ex}px`, "--ey": `${h.ey}px`, animationDelay: `${h.delay}ms` } as React.CSSProperties}
          >
            {e}
          </span>
        ))}
      </div>
    );
  }
  if (proj === "artillery") {
    return (
      <div key={id} className="fx-carpet">
        {hits.map((h, i) => (
          <span
            key={i}
            className="fx-proj arcshell"
            style={{ "--ex": `${h.ex}px`, "--ey": `${h.ey}px`, animationDelay: `${h.delay}ms` } as React.CSSProperties}
          >
            💣
          </span>
        ))}
      </div>
    );
  }
  if (proj === "laser") {
    return (
      <div key={id} className="fx-laser">
        {hits.map((h, i) => (
          <span
            key={i}
            className={`fx-laser-unit${i === 0 ? " main" : " side"}`}
            style={{ left: `calc(50% + ${h.ex}px)`, top: `calc(50% + ${h.ey}px)` }}
          >
            <span className="fx-laser-ring" />
            <span className="fx-laser-beam" />
          </span>
        ))}
      </div>
    );
  }
  if (proj === "barrage") {
    return (
      <div key={id} className="fx-barrage">
        <span className="fx-proj barrage b1">🚀</span>
        <span className="fx-proj barrage b2">🚀</span>
        <span className="fx-proj barrage b3">🚀</span>
      </div>
    );
  }
  if (proj === "tank") {
    return <div key={id} className="fx-tracer" />;
  }
  if (proj === "nuke") {
    return null;
  }
  return (
    <div key={id} className={`fx-proj ${proj}`}>
      {PROJ_EMOJI[proj]}
    </div>
  );
}

// ---- StrikeStage: plays ONE projectile effect, then calls onImpact -----------
// Renders the projectile + its blasts/bursts. The caller wraps it in a
// positioned, sized container (a Lab card, or a cell-anchored board overlay).
export function StrikeStage({
  proj,
  side,
  impactMs,
  speed = 1,
  onImpact,
  onDone,
}: {
  proj: Proj;
  side: Side;
  impactMs: number;
  speed?: number;
  onImpact?: () => void;
  onDone?: () => void;
}) {
  const [hits] = useState(() => computeHits(proj));
  const [booms, setBooms] = useState<{ id: number; x: number; y: number; mega: boolean }[]>([]);
  const [fires, setFires] = useState<{ id: number; x: number; y: number }[]>([]);
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number; bits: Bit[] }[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    const timers: number[] = [];
    const S = speed > 0 ? speed : 1;
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms / S));

    const maxDelay = hits.reduce((m, h) => Math.max(m, h.delay), 0);
    later(() => onImpact?.(), impactMs);
    later(() => onDone?.(), impactMs + maxDelay + 900);
    hits.forEach((h) => {
      later(() => {
        const bid = ++idRef.current;
        if (h.blast === "fire") {
          setFires((a) => [...a, { id: bid, x: h.ex, y: h.ey }]);
          later(() => setFires((a) => a.filter((f) => f.id !== bid)), 900);
        } else {
          setBooms((a) => [...a, { id: bid, x: h.ex, y: h.ey, mega: !!h.mega }]);
          later(() => setBooms((a) => a.filter((b) => b.id !== bid)), h.mega ? 600 : 400);
        }
        const buid = ++idRef.current;
        setBursts((a) => [...a, { id: buid, x: h.ex, y: h.ey, bits: makeBits(side, h.level) }]);
        later(() => setBursts((a) => a.filter((b) => b.id !== buid)), 700);
      }, impactMs + h.delay);
    });
    return () => timers.forEach((t) => clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {renderProjectile(proj, 1, hits)}
      {booms.map((b) => (
        <div
          key={b.id}
          className={`fx-boom${b.mega ? " mega" : ""}`}
          style={{ left: `calc(50% + ${b.x}px)`, top: `calc(50% + ${b.y}px)` }}
        />
      ))}
      {fires.map((f) => (
        <div
          key={f.id}
          className="fx-napalm-fire"
          style={{ left: `calc(50% + ${f.x}px)`, top: `calc(50% + ${f.y}px)` }}
        />
      ))}
      {bursts.map((bu) => (
        <div
          key={bu.id}
          className="fx-burst"
          style={{ left: `calc(50% + ${bu.x}px)`, top: `calc(50% + ${bu.y}px)` }}
        >
          {bu.bits.map((b) => (
            <span
              key={b.id}
              className="fx-bit"
              style={
                {
                  "--tx": `${b.tx}px`,
                  "--ty": `${b.ty}px`,
                  "--rot": `${b.rot}deg`,
                  "--sz": `${b.sz}px`,
                  "--c": b.c,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      ))}
    </>
  );
}
