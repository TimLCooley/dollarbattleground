"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { xPattern, strikePattern } from "@/lib/board-patterns";
import { normalizeShow, planStrike, SHOW_DEFAULTS, type ShowConfig } from "@/lib/war-show";

// The War Show, client side. Real tiles stay the source of truth; the show is
// an overlay of pretend flips on top of them:
//   • nothing is written anywhere — a reload shows the real board;
//   • a real flip arriving over realtime drops the pretend one on that tile;
//   • the viewer's own tiles are never touched, and whatever they aim at snaps
//     back to reality so what they'd pay for is what they get;
//   • the overlay is capped (config.drift) and strikes take overlaid tiles
//     back first once it's full, so the board hovers around reality.

const N = 15;
const TOTAL = N * N;

type Team = "red" | "blue";
type CellVal = Team | null;
type Kind = "flip" | "x" | "strike";

const patternOf = (kind: Kind, c: number) =>
  kind === "x" ? xPattern(c) : kind === "strike" ? strikePattern(c) : [c];

// ---- the knobs, read from the public endpoint ------------------------------
// Re-read every couple of minutes so flipping the switch in the admin strip
// reaches people already on the board.
const REFRESH_MS = 120_000;

export function useShowConfig(): ShowConfig {
  const [cfg, setCfg] = useState<ShowConfig>(SHOW_DEFAULTS);
  useEffect(() => {
    let alive = true;
    const read = () =>
      fetch("/api/show")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (alive && d) setCfg(normalizeShow(d));
        })
        .catch(() => {});
    read();
    const t = window.setInterval(read, REFRESH_MS);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  return cfg;
}

// ---- admin preview flag ----------------------------------------------------
// Admins see the real board by default (that's the point of logging in); this
// local flag lets the admin watch the show on their own board.
const PREVIEW_KEY = "bg_admin_showpreview";

export function useShowPreview(): { preview: boolean; toggle: () => void } {
  const [preview, setPreview] = useState(false);
  useEffect(() => {
    const read = () => {
      try {
        setPreview(localStorage.getItem(PREVIEW_KEY) === "1");
      } catch {
        /* ignore */
      }
    };
    read();
    window.addEventListener("bg:showpreview", read);
    return () => window.removeEventListener("bg:showpreview", read);
  }, []);
  const toggle = useCallback(() => {
    try {
      localStorage.setItem(PREVIEW_KEY, localStorage.getItem(PREVIEW_KEY) === "1" ? "0" : "1");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event("bg:showpreview"));
  }, []);
  return { preview, toggle };
}

// ---- the show itself -------------------------------------------------------
export interface SimStrike {
  center: number;
  kind: Kind;
  attacker: Team;
  idxs: number[]; // the tiles that turn
}

export interface WarShowInput {
  cells: CellVal[]; // the real board
  loaded: boolean; // false until the real board arrived (never play on the placeholder)
  owned: Set<number>; // the viewer's tiles — never touched
  side: Team; // the viewer's side
  enabled: boolean;
  config: ShowConfig;
  // Play the visuals for one strike; call paint() when the impact lands.
  fire: (strike: SimStrike, paint: () => void) => void;
}

export interface WarShow {
  shown: CellVal[]; // what the viewer sees: real tiles under the overlay
  counts: { b: number; r: number; n: number };
  overlay: number; // how many tiles are currently pretend
  // Snap these tiles back to reality and keep the show off them (the aim /
  // hover pattern). Pass [] when nothing is aimed.
  protect: (idxs: number[]) => void;
}

interface Entry {
  team: Team; // what the overlay shows
  base: CellVal; // the real value when it was painted — if that changes, reality wins
}

export function useWarShow({ cells, loaded, owned, side, enabled, config, fire }: WarShowInput): WarShow {
  const [overlay, setOverlay] = useState<Map<number, Entry>>(() => new Map());

  // Switching the show on or off starts from a clean board.
  const [prevEnabled, setPrevEnabled] = useState(enabled);
  if (enabled !== prevEnabled) {
    setPrevEnabled(enabled);
    setOverlay(new Map());
  }

  // Refs so the scheduler reads the latest board without re-arming its timer
  // on every realtime flip. Written after render, read from timers.
  const cellsRef = useRef(cells);
  const overlayRef = useRef(overlay);
  const ownedRef = useRef(owned);
  const sideRef = useRef(side);
  const configRef = useRef(config);
  const fireRef = useRef(fire);
  const protectedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    cellsRef.current = cells;
    overlayRef.current = overlay;
    ownedRef.current = owned;
    sideRef.current = side;
    configRef.current = config;
    fireRef.current = fire;
  });

  // An overlaid tile whose real value changed since it was painted is stale:
  // reality wins, and the entry is ignored until the next paint sweeps it.
  const live = useCallback((ov: Map<number, Entry>, real: CellVal[]) => {
    const out = new Map<number, Entry>();
    ov.forEach((e, i) => {
      if (real[i] === e.base) out.set(i, e);
    });
    return out;
  }, []);

  const protect = useCallback((idxs: number[]) => {
    protectedRef.current = new Set(idxs);
    if (!idxs.some((i) => overlayRef.current.has(i))) return;
    setOverlay((prev) => {
      const next = new Map(prev);
      idxs.forEach((i) => next.delete(i));
      return next;
    });
  }, []);

  const shown = useMemo(() => {
    if (overlay.size === 0) return cells;
    const out = [...cells];
    overlay.forEach((e, i) => {
      if (cells[i] === e.base) out[i] = e.team;
    });
    return out;
  }, [cells, overlay]);
  const overlayCount = useMemo(() => live(overlay, cells).size, [live, overlay, cells]);

  const counts = useMemo(() => {
    let b = 0,
      r = 0;
    for (const c of shown) {
      if (c === "blue") b++;
      else if (c === "red") r++;
    }
    return { b, r, n: TOTAL - b - r };
  }, [shown]);

  // One strike: plan who, how big, and where (planStrike), then hand the
  // visuals to the board. paint() applies the overlay at impact.
  const strikeOnce = useCallback(() => {
    const real = cellsRef.current;
    const ov = live(overlayRef.current, real);
    const view = real.map((c, i) => ov.get(i)?.team ?? c);
    const plan = planStrike({
      view,
      n: N,
      overlaid: new Set(ov.keys()),
      offLimits: (i) => ownedRef.current.has(i) || protectedRef.current.has(i),
      me: sideRef.current,
      config: configRef.current,
      pattern: patternOf,
    });
    if (!plan) return;
    const { attacker, flips } = plan;

    const paint = () => {
      const now = cellsRef.current;
      setOverlay((prev) => {
        const next = live(prev, now); // sweep stale entries while we're here
        for (const k of flips) {
          if (protectedRef.current.has(k) || ownedRef.current.has(k)) continue;
          if (now[k] === attacker) next.delete(k); // back to its real color
          else next.set(k, { team: attacker, base: now[k] });
        }
        return next;
      });
    };
    fireRef.current({ center: plan.center, kind: plan.kind, attacker, idxs: flips }, paint);
  }, [live]);

  // Cadence. The first strike comes soon after the board loads; after that the
  // gap stretches from minGapS toward maxGapS over the first ten minutes, with
  // jitter so it never ticks like a clock. A hidden tab waits — nobody should
  // come back to a board that fought a whole war without them.
  useEffect(() => {
    if (!enabled || !loaded) return;
    const started = Date.now();
    let timer = 0;
    let alive = true;
    const gapMs = () => {
      const { minGapS, maxGapS } = configRef.current;
      const t = Math.min(1, (Date.now() - started) / 600_000);
      const g = minGapS + (maxGapS - minGapS) * t;
      return g * 1000 * (0.7 + Math.random() * 0.6);
    };
    const tick = () => {
      if (!alive) return;
      if (document.hidden) {
        timer = window.setTimeout(tick, 4000);
        return;
      }
      strikeOnce();
      timer = window.setTimeout(tick, gapMs());
    };
    timer = window.setTimeout(tick, configRef.current.firstS * 1000 * (0.8 + Math.random() * 0.4));
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [enabled, loaded, strikeOnce]);

  return { shown, counts, overlay: overlayCount, protect };
}
