// The War Show: a simulated war the board plays for visitors — bombs fly in and
// turn tiles while they watch — so the front looks alive between real flips.
//
// Nothing here touches the real board. The show is a client-side overlay on
// top of the live tiles (see use-war-show.ts): the database never changes, a
// reload shows reality, and real flips arriving over realtime always win. The
// knobs live in app_config under WAR_SHOW_KEY so they apply to every visitor
// without a deploy. Shared by the admin strip, the public endpoint and the
// board (no "server-only" here).

export const WAR_SHOW_KEY = "war_show";

export type ShowWho = "both" | "allies" | "enemy";
export type ShowIntensity = "calm" | "normal" | "heavy";

export interface ShowConfig {
  on: boolean;
  // Cadence, in seconds. The first strike lands firstS after the board loads
  // (so a short visit still sees one); after that the gap between strikes
  // grows from minGapS toward maxGapS over the first ten minutes on the page.
  // Nobody knows how long a visitor stays, so the show starts lively and
  // settles, instead of running a fixed clock that gets silly on a long stay.
  firstS: number;
  minGapS: number;
  maxGapS: number;
  // How far the shown board may drift from the real one, in tiles. Once the
  // overlay holds this many, strikes land on overlaid tiles first (taking them
  // back), so the board hovers around reality instead of running away.
  drift: number;
  // Who attacks: both sides trade blows, only the viewer's side (allies), or
  // only the enemy (pressure).
  who: ShowWho;
  // Mix of strike sizes: calm = mostly singles, heavy = plenty of blocks.
  intensity: ShowIntensity;
}

export const SHOW_DEFAULTS: ShowConfig = {
  on: false,
  firstS: 12,
  minGapS: 25,
  maxGapS: 90,
  drift: 18,
  who: "both",
  intensity: "normal",
};

// Odds of each strike size per intensity: [single, 2×2, 3×3].
export const INTENSITY_MIX: Record<ShowIntensity, [number, number, number]> = {
  calm: [0.8, 0.17, 0.03],
  normal: [0.6, 0.3, 0.1],
  heavy: [0.4, 0.38, 0.22],
};

const clampNum = (v: unknown, lo: number, hi: number, dflt: number) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, Math.round(n)));
};

// Whatever is stored (or posted) → a complete, sane config.
export function normalizeShow(raw: unknown): ShowConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof ShowConfig, unknown>>;
  const minGapS = clampNum(r.minGapS, 5, 600, SHOW_DEFAULTS.minGapS);
  return {
    on: r.on === true,
    firstS: clampNum(r.firstS, 3, 300, SHOW_DEFAULTS.firstS),
    minGapS,
    maxGapS: Math.max(minGapS, clampNum(r.maxGapS, 5, 1800, SHOW_DEFAULTS.maxGapS)),
    drift: clampNum(r.drift, 1, 120, SHOW_DEFAULTS.drift),
    who: r.who === "allies" || r.who === "enemy" ? r.who : "both",
    intensity: r.intensity === "calm" || r.intensity === "heavy" ? r.intensity : "normal",
  };
}

// ---- planning one strike (pure, so it can be tested without a browser) -----
export type ShowTeam = "red" | "blue";
export type ShowKind = "flip" | "x" | "strike";
export interface ShowPlan {
  center: number;
  kind: ShowKind;
  attacker: ShowTeam;
  flips: number[]; // the tiles that turn
}

const other = (t: ShowTeam): ShowTeam => (t === "red" ? "blue" : "red");

// view: the board as the viewer sees it (real tiles under the overlay).
// overlaid: tiles currently pretend. offLimits: tiles the show must not touch
// (the viewer's own, whatever they're aiming at). pattern: the tiles a strike
// of that kind centred on c covers. rnd: Math.random, injectable for tests.
export function planStrike(
  args: {
    view: (ShowTeam | null)[];
    n: number;
    overlaid: Set<number>;
    offLimits: (i: number) => boolean;
    me: ShowTeam;
    config: ShowConfig;
    pattern: (kind: ShowKind, c: number) => number[];
  },
  rnd: () => number = Math.random,
): ShowPlan | null {
  const { view, n, overlaid, offLimits, me, config: cfg, pattern } = args;
  const attacker: ShowTeam =
    cfg.who === "allies" ? me : cfg.who === "enemy" ? other(me) : rnd() < 0.5 ? me : other(me);
  const victim = other(attacker);

  const [p1, p2] = INTENSITY_MIX[cfg.intensity];
  const roll = rnd();
  const kind: ShowKind = roll < p1 ? "flip" : roll < p1 + p2 ? "x" : "strike";

  const total = n * n;
  const victimTotal = view.filter((c) => c === victim).length;
  const cands: { center: number; flips: number[]; score: number }[] = [];
  for (let c = 0; c < total; c++) {
    const idxs = pattern(kind, c);
    if (idxs.some(offLimits)) continue;
    const flips = idxs.filter((k) => view[k] === victim);
    if (flips.length === 0 || flips.length >= victimTotal) continue; // never wipe a side out
    // Overlaid tiles turning back to their real color shrink the overlay; real
    // tiles turning grow it. Stay under the cap.
    let net = 0;
    for (const k of flips) net += overlaid.has(k) ? -1 : 1;
    if (overlaid.size + net > cfg.drift) continue;
    // Prefer the front line: flips next to the attacker's own color.
    let front = 0;
    for (const k of flips) {
      const x = k % n;
      const y = Math.floor(k / n);
      if (x > 0 && view[k - 1] === attacker) front++;
      if (x < n - 1 && view[k + 1] === attacker) front++;
      if (y > 0 && view[k - n] === attacker) front++;
      if (y < n - 1 && view[k + n] === attacker) front++;
    }
    cands.push({ center: c, flips, score: flips.length * 2 + front + rnd() * 3 });
  }
  if (cands.length === 0) return null;
  cands.sort((a, b) => b.score - a.score);
  const pick = cands[Math.floor(rnd() * Math.min(5, cands.length))];
  return { center: pick.center, kind, attacker, flips: pick.flips };
}
