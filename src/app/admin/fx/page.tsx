"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import "./fx.css";
import {
  computeHits,
  makeBits,
  renderProjectile,
  colorVar,
  getFxSpeed,
  setFxSpeed,
  type Proj,
  type Side,
  type Level,
  type Hit,
  type Bit,
} from "@/lib/flip-fx";

type Kind = "overlay" | "3d" | "proj";

interface Effect {
  key: string;
  name: string;
  kind: Kind;
  anim?: string; // overlay animation class
  axis?: "y" | "x"; // 3d flip axis
  proj?: Proj;
  impactMs?: number; // when the blast lands (proj only)
  mega?: boolean; // nuke-scale impact
  tier?: "$1" | "$5" | "$10"; // price bucket (unset = bench/extra)
}

const PROJECTILES: Effect[] = [
  { key: "rocket", name: "Rocket Strike", kind: "proj", proj: "rocket", impactMs: 380, tier: "$5" },
  { key: "airstrike", name: "Airstrike", kind: "proj", proj: "bomb", impactMs: 380, tier: "$5" },
  { key: "mortar", name: "Mortar", kind: "proj", proj: "mortar", impactMs: 480, tier: "$5" },
  { key: "tank", name: "Tank Shell", kind: "proj", proj: "tank", impactMs: 260, tier: "$5" },
  { key: "laser", name: "Orbital Laser", kind: "proj", proj: "laser", impactMs: 560, tier: "$10" },
  { key: "carpet", name: "Carpet Bomb", kind: "proj", proj: "carpet", impactMs: 560, mega: true, tier: "$10" },
  { key: "napalm", name: "Napalm", kind: "proj", proj: "napalm", impactMs: 360, tier: "$10" },
  { key: "drone", name: "Drone Swarm", kind: "proj", proj: "drone", impactMs: 460, tier: "$10" },
  { key: "artillery", name: "Artillery Volley", kind: "proj", proj: "artillery", impactMs: 620, mega: true, tier: "$10" },
  { key: "meteor", name: "Meteor", kind: "proj", proj: "meteor", impactMs: 380, tier: "$5" },
  { key: "barrage", name: "Missile Barrage", kind: "proj", proj: "barrage", impactMs: 440, tier: "$5" },
  // bench (not assigned to a price tier)
  { key: "lightning", name: "Lightning", kind: "proj", proj: "lightning", impactMs: 240 },
  { key: "nuke", name: "NUKE", kind: "proj", proj: "nuke", impactMs: 300, mega: true },
  { key: "flag", name: "Flag Drop", kind: "proj", proj: "flag", impactMs: 640 },
];

const FLIPS: Effect[] = [
  { key: "coin", name: "Coin Flip", kind: "3d", axis: "y" },
  { key: "card", name: "Card Flip", kind: "3d", axis: "x" },
  { key: "spin", name: "Spin", kind: "overlay", anim: "of-spin", tier: "$1" },
  { key: "pop", name: "Pop", kind: "overlay", anim: "of-pop", tier: "$1" },
  { key: "splat", name: "Splat", kind: "overlay", anim: "of-splat", tier: "$1" },
  { key: "flash", name: "Flashbang", kind: "overlay", anim: "of-flash", tier: "$1" },
  // bench
  { key: "glitch", name: "Glitch", kind: "overlay", anim: "of-glitch" },
  { key: "roll", name: "Barrel Roll", kind: "overlay", anim: "of-roll" },
  { key: "stamp", name: "Stamp", kind: "overlay", anim: "of-stamp" },
  { key: "shock", name: "Shockwave", kind: "overlay", anim: "of-shock" },
  { key: "iris", name: "Iris", kind: "overlay", anim: "of-iris" },
  { key: "wipe", name: "Wipe", kind: "overlay", anim: "of-wipe" },
  { key: "slam", name: "Slam Drop", kind: "overlay", anim: "of-slam" },
  { key: "dissolve", name: "Dissolve", kind: "overlay", anim: "of-dissolve" },
  { key: "curtain", name: "Curtain", kind: "overlay", anim: "of-curtain" },
];

function FxTile({
  effect,
  particles,
  speed,
  rejected,
  onToggleReject,
  onCelebrate,
}: {
  effect: Effect;
  particles: boolean;
  speed: number;
  rejected: boolean;
  onToggleReject: (key: string) => void;
  onCelebrate: (color: string, origin: { x: number; y: number } | undefined, cele: Cele) => void;
}) {
  const myCele = tierCele(effect);
  const [side, setSide] = useState<Side>("blue");
  const [flip, setFlip] = useState<{ id: number; to: Side } | null>(null);
  const [proj, setProj] = useState<{ id: number; hits: Hit[] } | null>(null);
  const [booms, setBooms] = useState<{ id: number; x: number; y: number; mega: boolean }[]>(
    [],
  );
  const [fires, setFires] = useState<{ id: number; x: number; y: number }[]>([]);
  const [bursts, setBursts] = useState<
    { id: number; x: number; y: number; bits: Bit[] }[]
  >([]);
  const [shake, setShake] = useState(false);
  const idRef = useRef(0);
  const busy = useRef(false);
  const timers = useRef<number[]>([]);
  const tileRef = useRef<HTMLDivElement>(null);
  const originRef = useRef<{ x: number; y: number } | undefined>(undefined);
  // Read speed from a ref so the impact/boom timers always use the CURRENT
  // speed — even inside `fire`, which is memoized and would otherwise hold the
  // speed from its last recreation (making the first shot after a change desync
  // with the CSS flight animation, which does pick up the new speed on render).
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((id) => clearTimeout(id));
  }, []);
  const later = (fn: () => void, ms: number) => {
    const s = speedRef.current > 0 ? speedRef.current : 1;
    const id = window.setTimeout(fn, ms / s);
    timers.current.push(id);
  };

  const burstAt = useCallback(
    (to: Side, x: number, y: number, level: Level) => {
      if (!particles) return;
      const bid = ++idRef.current;
      setBursts((a) => [...a, { id: bid, x, y, bits: makeBits(to, level) }]);
      later(() => setBursts((a) => a.filter((b) => b.id !== bid)), 700);
    },
    [particles],
  );

  const commitFlip = useCallback(() => {
    setFlip((cur) => {
      if (cur) {
        setSide(cur.to);
        burstAt(cur.to, 0, 0, "small");
        onCelebrate(colorVar(cur.to), originRef.current, myCele);
      }
      return null;
    });
    busy.current = false;
  }, [burstAt, onCelebrate, myCele]);

  const fire = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    const to: Side = side === "blue" ? "red" : "blue";
    const id = ++idRef.current;
    const rect = tileRef.current?.getBoundingClientRect();
    originRef.current = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : undefined;

    if (effect.kind === "proj") {
      const impactMs = effect.impactMs ?? 380;
      const hits = computeHits(effect.proj!);
      const maxDelay = hits.reduce((m, h) => Math.max(m, h.delay), 0);
      setProj({ id, hits });
      later(() => setProj((p) => (p && p.id === id ? null : p)), impactMs + maxDelay + 80);

      // primary flip + screen celebration at first impact
      later(() => {
        setSide(to);
        onCelebrate(colorVar(to), originRef.current, myCele);
      }, impactMs);

      // each hit: its own blast + burst at its offset
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
          burstAt(to, h.ex, h.ey, h.level);
        }, impactMs + h.delay);
      });

      setShake(true);
      later(() => setShake(false), impactMs + maxDelay + (effect.mega ? 620 : 420));
      later(() => (busy.current = false), impactMs + maxDelay + 200);
    } else {
      setFlip({ id, to });
    }
  }, [side, effect, burstAt, onCelebrate, myCele]);

  return (
    <div className={`fx-card${rejected ? " nope" : ""}`}>
      <button className="fx-fire" onClick={fire} type="button">
      <div
        className={`fx-stage${shake ? (effect.mega ? " shake shake-mega" : " shake") : ""}`}
        style={{ "--fxspeed": speed } as React.CSSProperties}
      >
        <div
          ref={tileRef}
          className={`fx-tile fx-plate${effect.kind === "3d" ? " d3" : ""}`}
          style={{ backgroundColor: colorVar(side) }}
        >
          {flip && effect.kind === "overlay" && (
            <div
              key={flip.id}
              className={`fx-ov fx-plate ${effect.anim}`}
              style={{ backgroundColor: colorVar(flip.to) }}
              onAnimationEnd={commitFlip}
            />
          )}
          {flip && effect.kind === "3d" && (
            <div
              key={flip.id}
              className={`fx-flip3d ${effect.axis}`}
              onAnimationEnd={commitFlip}
            >
              <div
                className="fx-face fx-plate"
                style={{ backgroundColor: colorVar(side) }}
              />
              <div
                className={`fx-face fx-plate ${effect.axis === "y" ? "by" : "bx"}`}
                style={{ backgroundColor: colorVar(flip.to) }}
              />
            </div>
          )}
        </div>

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
        {effect.proj === "nuke" && booms.length > 0 && <div className="fx-nukeflash" />}
        {proj && effect.proj && renderProjectile(effect.proj, proj.id, proj.hits)}
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
      </div>
      </button>
      <span className="fx-name">{effect.name}</span>
      <button
        className="fx-reject"
        onClick={() => onToggleReject(effect.key)}
        type="button"
      >
        {rejected ? "↩ keep" : "✕ no"}
      </button>
    </div>
  );
}

const ALL: Effect[] = [...PROJECTILES, ...FLIPS];
const REJECT_KEY = "fx_rejects_v1";

/* ---------- full-screen celebrations ---------- */
type Cele = "none" | "fireworks" | "confetti" | "wave";
const CELE_MS: Record<Cele, number> = {
  none: 0,
  fireworks: 1500,
  confetti: 2800,
  wave: 800,
};

// the screen FX baked into each price tier
function tierCele(e: Effect): Cele {
  if (e.tier === "$1") return "fireworks";
  if (e.tier === "$5" || e.tier === "$10") return "wave";
  return "none";
}

// override the tier default while testing ("auto" = respect the tier)
type Override = "auto" | Cele;
const OVERRIDE_LABEL: Record<Override, string> = {
  auto: "Auto",
  none: "None",
  fireworks: "Fireworks",
  confetti: "Confetti",
  wave: "Shock Wave",
};

const TIER_INFO: { tier: "$1" | "$5" | "$10"; title: string; fx: string }[] = [
  { tier: "$1", title: "$1 · SINGLE FLIP", fx: "Fireworks" },
  { tier: "$5", title: "$5 · 2×2 STRIKE", fx: "Shock Wave" },
  { tier: "$10", title: "$10 · 3×3 BARRAGE", fx: "Shock Wave" },
];

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
      bits.push({
        tx: Math.cos(ang) * dist,
        ty: Math.sin(ang) * dist,
        c,
        sz: 3 + Math.random() * 3,
      });
    }
    shells.push({
      bx: 10 + Math.random() * 80,
      by: 12 + Math.random() * 42,
      delay: Math.random() * 0.5,
      bits,
    });
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

function ScreenFx({
  fx,
}: {
  fx: { id: number; type: Cele; color: string; x: number; y: number } | null;
}) {
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
          style={
            { "--c": fx.color, left: `${fx.x}px`, top: `${fx.y}px` } as React.CSSProperties
          }
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

export default function FxPage() {
  const [particles, setParticles] = useState(true);
  const [big, setBig] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [override, setOverride] = useState<Override>("auto");
  const [screen, setScreen] = useState<{
    id: number;
    type: Cele;
    color: string;
    x: number;
    y: number;
  } | null>(null);
  const screenId = useRef(0);
  const screenTimer = useRef<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(REJECT_KEY);
      if (raw) setRejected(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
    setSpeed(getFxSpeed());
  }, []);

  // The slider IS the game's speed knob — persist it so the board reads it too.
  function changeSpeed(v: number) {
    setSpeed(v);
    setFxSpeed(v);
  }

  const celebrate = useCallback(
    (color: string, origin: { x: number; y: number } | undefined, cele: Cele) => {
      const type: Cele = override === "auto" ? cele : override;
      if (type === "none") return;
      const id = ++screenId.current;
      const x = origin?.x ?? (typeof window !== "undefined" ? window.innerWidth / 2 : 0);
      const y = origin?.y ?? (typeof window !== "undefined" ? window.innerHeight / 2 : 0);
      setScreen({ id, type, color, x, y });
      if (screenTimer.current) clearTimeout(screenTimer.current);
      screenTimer.current = window.setTimeout(
        () => setScreen((s) => (s && s.id === id ? null : s)),
        CELE_MS[type],
      );
    },
    [override],
  );

  const toggleReject = useCallback((key: string) => {
    setRejected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(REJECT_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const tile = (e: Effect, isRejected: boolean) => (
    <FxTile
      key={e.key}
      effect={e}
      particles={particles}
      speed={speed}
      rejected={isRejected}
      onToggleReject={toggleReject}
      onCelebrate={celebrate}
    />
  );

  const nopes = ALL.filter((e) => rejected.has(e.key));
  const bench = ALL.filter((e) => !e.tier && !rejected.has(e.key));

  return (
    <AdminShell title="FLIP LAB">
      <main className="fxlab-wrap" data-size={big ? "big" : "actual"}>
      <div className="fx-head">
        <p>Organized by price. Tap to fire; ✕ no benches a dud.</p>
      </div>

      <div className="fx-toggles">
        <button
          className="fx-toggle"
          data-on={particles}
          onClick={() => setParticles((v) => !v)}
          type="button"
        >
          DEBRIS {particles ? "ON" : "OFF"}
        </button>
        <button
          className="fx-toggle"
          data-on={big}
          onClick={() => setBig((v) => !v)}
          type="button"
        >
          TILE {big ? "BIG" : "ACTUAL"}
        </button>
      </div>

      <div className="fx-styles">
        <span className="fx-styles-label">SPEED: {speed.toFixed(2)}×</span>
        <input
          className="fx-speed"
          type="range"
          min={0.3}
          max={2}
          step={0.05}
          value={speed}
          onChange={(e) => changeSpeed(Number(e.target.value))}
        />
        <button className="fx-toggle" type="button" onClick={() => changeSpeed(1)}>
          RESET
        </button>
        <span className="fx-styles-label">— drives the live game too</span>
      </div>

      <div className="fx-styles">
        <span className="fx-styles-label">SCREEN FX:</span>
        {(Object.keys(OVERRIDE_LABEL) as Override[]).map((c) => (
          <button
            key={c}
            className="fx-toggle"
            data-on={override === c}
            onClick={() => setOverride(c)}
            type="button"
          >
            {OVERRIDE_LABEL[c]}
          </button>
        ))}
      </div>

      {TIER_INFO.map((info) => {
        const items = ALL.filter((e) => e.tier === info.tier && !rejected.has(e.key));
        if (items.length === 0) return null;
        return (
          <section key={info.tier} className="fx-tier">
            <div className="fx-tier-head">
              <span className="fx-tier-title">{info.title}</span>
              <span className="fx-tier-fx">+ {info.fx}</span>
            </div>
            <div className="fxlab">{items.map((e) => tile(e, false))}</div>
          </section>
        );
      })}

      {bench.length > 0 && (
        <section className="fx-tier">
          <div className="fx-divider">
            <span>BENCH — not priced</span>
          </div>
          <div className="fxlab">{bench.map((e) => tile(e, false))}</div>
        </section>
      )}

      {nopes.length > 0 && (
        <section className="fx-tier">
          <div className="fx-divider">
            <span>NOPE — {nopes.length} rejected</span>
          </div>
          <div className="fxlab fxlab-nope">{nopes.map((e) => tile(e, true))}</div>
        </section>
      )}

      <ScreenFx fx={screen} />
      </main>
    </AdminShell>
  );
}
