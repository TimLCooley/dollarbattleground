"use client";

import { useMemo } from "react";

// Full-screen celebration effects, shared by the Flip Lab and the live board.
// Fireworks / confetti / a shockwave that radiates from a point (the tapped tile).
export type Cele = "none" | "fireworks" | "confetti" | "wave";

export const CELE_MS: Record<Cele, number> = {
  none: 0,
  fireworks: 1500,
  confetti: 2800,
  wave: 800,
};

export interface ScreenFxState {
  id: number;
  type: Cele;
  color: string;
  x: number;
  y: number;
}

interface FwBit {
  tx: number;
  ty: number;
  c: string;
  sz: number;
}
interface Shell {
  bx: number;
  by: number;
  delay: number;
  bits: FwBit[];
}
function fireworksData(color: string): Shell[] {
  const shells: Shell[] = [];
  for (let s = 0; s < 6; s++) {
    const bits: FwBit[] = [];
    const m = 18;
    for (let i = 0; i < m; i++) {
      const ang = (i / m) * Math.PI * 2;
      const dist = 55 + Math.random() * 75;
      const r = Math.random();
      const c = r < 0.3 ? "#fff" : r < 0.5 ? "var(--gold)" : color;
      bits.push({ tx: Math.cos(ang) * dist, ty: Math.sin(ang) * dist, c, sz: 3 + Math.random() * 3 });
    }
    shells.push({ bx: 10 + Math.random() * 80, by: 12 + Math.random() * 42, delay: Math.random() * 0.5, bits });
  }
  return shells;
}

interface Conf {
  left: number;
  delay: number;
  dur: number;
  drift: number;
  rot: number;
  c: string;
  w: number;
  h: number;
}
function confettiData(color: string): Conf[] {
  const out: Conf[] = [];
  for (let i = 0; i < 70; i++) {
    const r = Math.random();
    const c = r < 0.25 ? "#fff" : r < 0.4 ? "var(--gold)" : color;
    out.push({
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      dur: 1.8 + Math.random() * 1.2,
      drift: (Math.random() - 0.5) * 120,
      rot: Math.random() * 1080 - 540,
      c,
      w: 5 + Math.random() * 5,
      h: 8 + Math.random() * 8,
    });
  }
  return out;
}

export function ScreenFx({ fx }: { fx: ScreenFxState | null }) {
  const shells = useMemo(
    () => (fx?.type === "fireworks" ? fireworksData(fx.color) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fx?.id],
  );
  const conf = useMemo(
    () => (fx?.type === "confetti" ? confettiData(fx.color) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fx?.id],
  );
  if (!fx) return null;

  if (fx.type === "wave") {
    return (
      <div className="screenfx">
        <div
          className="sfx-wave"
          style={{ "--c": fx.color, left: `${fx.x}px`, top: `${fx.y}px` } as React.CSSProperties}
        />
      </div>
    );
  }
  if (fx.type === "fireworks" && shells) {
    return (
      <div className="screenfx">
        {shells.map((sh, si) => (
          <div key={si} className="fw-shell" style={{ left: `${sh.bx}%`, top: `${sh.by}%` }}>
            {sh.bits.map((b, bi) => (
              <span
                key={bi}
                className="fw-bit"
                style={
                  {
                    "--tx": `${b.tx}px`,
                    "--ty": `${b.ty}px`,
                    "--c": b.c,
                    "--sz": `${b.sz}px`,
                    animationDelay: `${sh.delay}s`,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
        ))}
      </div>
    );
  }
  if (fx.type === "confetti" && conf) {
    return (
      <div className="screenfx">
        {conf.map((p, i) => (
          <span
            key={i}
            className="cf-piece"
            style={
              {
                left: `${p.left}%`,
                width: `${p.w}px`,
                height: `${p.h}px`,
                background: p.c,
                "--drift": `${p.drift}px`,
                "--rot": `${p.rot}deg`,
                animationDuration: `${p.dur}s`,
                animationDelay: `${p.delay}s`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    );
  }
  return null;
}
