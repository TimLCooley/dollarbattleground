// Commander — the daily war puzzle. Pure, shared by the page (live preview)
// and the server (scoring + the exact solver), so both always agree.
//
// Rules (Tim, 2026-10-16):
// - The whole map starts as the enemy's color.
// - The Commander deploys first, anywhere, and takes the 3×3 around it.
// - Archers and Soldiers deploy only on ground you hold (any of it, including
//   ground taken a moment ago), so order is the puzzle.
// - Archer: 3 left + 3 right. Flies over walls and water; a tree stops it.
// - Soldier: 2 up + 2 down. Walks through trees (and takes them); walls and
//   water stop it.
// - Score = squares you turned to your color.
// - The troop count changes every day (2–5 Archers, 2–5 Soldiers).

export const SIZE = 11;
export const CELLS = SIZE * SIZE;

export const GRASS = 0;
export const WALL = 1;
export const TREE = 2;
export const WATER = 3;

export type Kind = "commander" | "archer" | "soldier";
export const KINDS: Kind[] = ["commander", "archer", "soldier"];

export type Layout = {
  day: number;
  weekday: number; // 0 = Sunday … 6 = Saturday (America/Denver)
  terrain: number[]; // GRASS | WALL | TREE | WATER
  troops: Record<Kind, number>;
};

export type Placement = { i: number; kind: Kind };

// ---------- days ----------

const DAY_ONE = Date.UTC(2026, 9, 15); // 2026-10-15 = Commander #1

function denverYmd(now: Date) {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
/** Today's puzzle number in America/Denver. */
export const dayNumber = (now = new Date()) => Math.round((denverYmd(now) - DAY_ONE) / 86_400_000) + 1;
export const weekdayOf = (day: number) => new Date(DAY_ONE + (day - 1) * 86_400_000).getUTCDay();

export const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** NYT-style: Monday easiest, Friday/Saturday hardest, Sunday middle. */
export const DIFFICULTY = [2, 0, 1, 2, 3, 4, 4];
export const DIFFICULTY_NAME = ["Easy", "Gentle", "Medium", "Tricky", "Hard"];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const idx = (x: number, y: number) => y * SIZE + x;
export const xy = (i: number) => [i % SIZE, Math.floor(i / SIZE)] as const;
/** Ground that can be taken and stood on. */
export const ownable = (L: Layout, i: number) => L.terrain[i] === GRASS || L.terrain[i] === TREE;

// ---------- generation ----------

/** One candidate map; `attempt` reseeds. Harder days get more terrain. */
export function generate(day: number, attempt = 0): Layout {
  const weekday = weekdayOf(day);
  const level = DIFFICULTY[weekday];
  const rnd = mulberry32(day * 7919 + attempt * 104729 + 17);
  const pick = (n: number) => Math.floor(rnd() * n);
  const terrain = new Array<number>(CELLS).fill(GRASS);
  const freeAt = (x: number, y: number) => x >= 0 && y >= 0 && x < SIZE && y < SIZE && terrain[idx(x, y)] === GRASS;

  // a river, mostly vertical (archers fly over it, soldiers can't cross)
  if (rnd() < 0.5 + level * 0.1) {
    let x = 2 + pick(SIZE - 4);
    for (let y = 0; y < SIZE; y++) {
      terrain[idx(x, y)] = rnd() < 0.12 ? GRASS : WATER; // the odd ford
      if (rnd() < 0.25) x = Math.min(SIZE - 2, Math.max(1, x + (rnd() < 0.5 ? -1 : 1)));
    }
  }
  // a second river on harder days
  if (level >= 3 && rnd() < 0.5) {
    let x = 1 + pick(SIZE - 2);
    for (let y = 0; y < SIZE; y++) {
      if (terrain[idx(x, y)] === GRASS && rnd() > 0.15) terrain[idx(x, y)] = WATER;
      if (rnd() < 0.3) x = Math.min(SIZE - 2, Math.max(1, x + (rnd() < 0.5 ? -1 : 1)));
    }
  }
  // a pond
  if (rnd() < 0.6) {
    const [x, y] = [1 + pick(SIZE - 2), 1 + pick(SIZE - 2)];
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (freeAt(x + dx, y + dy) && rnd() < 0.8) terrain[idx(x + dx, y + dy)] = WATER;
  }
  // wall runs, mostly horizontal (soldiers can't pass; archers fly over)
  const runs = 3 + pick(3) + level;
  for (let r = 0; r < runs; r++) {
    const [x0, y0] = [pick(SIZE), pick(SIZE)];
    const horiz = rnd() < 0.7;
    const len = 2 + pick(3);
    for (let k = 0; k < len; k++) {
      const [x, y] = horiz ? [x0 + k, y0] : [x0, y0 + k];
      if (freeAt(x, y)) terrain[idx(x, y)] = WALL;
    }
  }
  // trees (stop arrows; soldiers walk through and take them)
  const trees = 8 + pick(5) + level * 2;
  for (let k = 0, g = 0; k < trees && g < 400; g++) {
    const [x, y] = [pick(SIZE), pick(SIZE)];
    if (!freeAt(x, y)) continue;
    terrain[idx(x, y)] = TREE;
    k++;
  }
  // a different army every day
  const archer = 2 + pick(4);
  const soldier = 2 + pick(4);
  return { day, weekday, terrain, troops: { commander: 1, archer, soldier } };
}

// ---------- reach ----------

/** Tiles a troop takes from `i`, including the tile it stands on. */
export function reach(L: Layout, i: number, kind: Kind): number[] {
  const [x0, y0] = xy(i);
  const out: number[] = [];
  if (kind === "commander") {
    for (let y = y0 - 1; y <= y0 + 1; y++)
      for (let x = x0 - 1; x <= x0 + 1; x++) if (x >= 0 && y >= 0 && x < SIZE && y < SIZE && ownable(L, idx(x, y))) out.push(idx(x, y));
    return out;
  }
  if (ownable(L, i)) out.push(i);
  const dirs = kind === "archer" ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
  const range = kind === "archer" ? 3 : 2;
  for (const [dx, dy] of dirs) {
    for (let k = 1; k <= range; k++) {
      const x = x0 + dx * k;
      const y = y0 + dy * k;
      if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) break;
      const t = L.terrain[idx(x, y)];
      if (kind === "archer") {
        if (t === TREE) break; // the shot hits the tree
        if (t === WALL || t === WATER) continue; // flies over
      } else if (t === WALL || t === WATER) break; // soldiers can't pass
      out.push(idx(x, y));
    }
  }
  return out;
}

// ---------- the battle ----------

export type Result = {
  final: Uint8Array; // 1 = yours
  score: number;
  invalidAt: number; // first troop that couldn't stand where it is, or -1
};

/** Commander first, anywhere on land; everyone else on ground you hold. */
function canDeploy(L: Layout, final: Uint8Array, occupied: Set<number>, p: Placement, placed: number) {
  if (p.i < 0 || p.i >= CELLS || occupied.has(p.i)) return false;
  if (p.kind === "commander") return placed === 0 && ownable(L, p.i);
  return placed > 0 && final[p.i] === 1;
}

export function simulate(L: Layout, placements: Placement[]): Result {
  const final = new Uint8Array(CELLS);
  const occupied = new Set<number>();
  let invalidAt = -1;
  for (let k = 0; k < placements.length; k++) {
    const p = placements[k];
    if (!canDeploy(L, final, occupied, p, k)) {
      invalidAt = k;
      break;
    }
    occupied.add(p.i);
    for (const t of reach(L, p.i, p.kind)) final[t] = 1;
  }
  let score = 0;
  for (let i = 0; i < CELLS; i++) score += final[i];
  return { final, score, invalidAt };
}

/** Where the next troop of `kind` may stand. */
export function deployable(L: Layout, final: Uint8Array, placements: Placement[], kind: Kind): Set<number> {
  const occ = new Set(placements.map((p) => p.i));
  const out = new Set<number>();
  for (let i = 0; i < CELLS; i++) if (canDeploy(L, final, occ, { i, kind }, placements.length)) out.add(i);
  return out;
}

/** Keep troops, in order, while they can still stand where they are (after a pick-up). */
export function prune(L: Layout, placements: Placement[]): Placement[] {
  const kept: Placement[] = [];
  for (const p of placements) if (simulate(L, [...kept, p]).invalidAt < 0) kept.push(p);
  return kept;
}

export function validate(L: Layout, placements: Placement[]): string | null {
  const count: Record<Kind, number> = { commander: 0, archer: 0, soldier: 0 };
  for (const p of placements) {
    if (!KINDS.includes(p.kind) || !Number.isInteger(p.i)) return "unknown troop";
    count[p.kind]++;
  }
  for (const k of KINDS) if (count[k] > L.troops[k]) return `too many ${k}s`;
  if (simulate(L, placements).invalidAt >= 0) return "the Commander goes first; everyone else deploys on ground you hold";
  return null;
}

// ---------- the exact best, and how most people will play ----------

/** Exact optimum: every Commander spot, then depth-first over useful deployments with an upper-bound cut. */
export function solve(L: Layout): { score: number; placements: Placement[]; checked: number } {
  const R = new Map<string, number[]>();
  for (let i = 0; i < CELLS; i++) for (const k of KINDS) R.set(`${i}:${k}`, reach(L, i, k));
  const maxGain = { archer: 6, soldier: 4 };
  let best = { score: 0, placements: [] as Placement[] };
  let checked = 0;
  const seen = new Set<string>();

  const dfs = (final: Uint8Array, score: number, pl: Placement[], left: { archer: number; soldier: number }) => {
    checked++;
    if (score > best.score) best = { score, placements: pl.slice() };
    if (score + left.archer * maxGain.archer + left.soldier * maxGain.soldier <= best.score) return;
    const occ = new Set(pl.map((p) => p.i));
    let key = `${left.archer}${left.soldier}`;
    for (let i = 0; i < CELLS; i++) key += final[i] ? (occ.has(i) ? "2" : "1") : "0";
    if (seen.has(key)) return;
    seen.add(key);
    for (let i = 0; i < CELLS; i++) {
      if (!final[i] || occ.has(i)) continue;
      for (const kind of ["archer", "soldier"] as const) {
        if (left[kind] <= 0) continue;
        const tiles = R.get(`${i}:${kind}`)!;
        let add = 0;
        for (const t of tiles) if (!final[t]) add++;
        if (!add) continue; // no bonuses in this version: a troop that takes nothing never helps
        const f = final.slice();
        for (const t of tiles) f[t] = 1;
        pl.push({ i, kind });
        left[kind]--;
        dfs(f, score + add, pl, left);
        left[kind]++;
        pl.pop();
      }
    }
  };

  for (let c = 0; c < CELLS; c++) {
    if (!ownable(L, c)) continue;
    const final = new Uint8Array(CELLS);
    const tiles = R.get(`${c}:commander`)!;
    for (const t of tiles) final[t] = 1;
    seen.clear();
    dfs(final, tiles.length, [{ i: c, kind: "commander" }], { archer: L.troops.archer, soldier: L.troops.soldier });
  }
  return { ...best, checked };
}

/** How most people will play: a roomy Commander spot, then each troop wherever it takes the most new ground. */
export function greedy(L: Layout): { score: number; placements: Placement[] } {
  let bestRun = { score: 0, placements: [] as Placement[] };
  const spots = Array.from({ length: CELLS }, (_, i) => i)
    .filter((i) => ownable(L, i))
    .map((i) => ({ i, n: reach(L, i, "commander").length }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);
  for (const s of spots) {
    const pl: Placement[] = [{ i: s.i, kind: "commander" }];
    let sim = simulate(L, pl);
    const left = { archer: L.troops.archer, soldier: L.troops.soldier };
    for (;;) {
      let move: Placement | null = null;
      let most = 0;
      for (const kind of ["archer", "soldier"] as const) {
        if (left[kind] <= 0) continue;
        for (const i of deployable(L, sim.final, pl, kind)) {
          let add = 0;
          for (const t of reach(L, i, kind)) if (!sim.final[t]) add++;
          if (add > most) {
            most = add;
            move = { i, kind };
          }
        }
      }
      if (!move) break;
      pl.push(move);
      left[move.kind as "archer" | "soldier"]--;
      sim = simulate(L, pl);
    }
    if (sim.score > bestRun.score) bestRun = { score: sim.score, placements: pl };
  }
  return bestRun;
}

/** How far below the best the obvious play should land, by difficulty level. */
const GAP_BAND: [number, number][] = [
  [0, 0.04],
  [0.04, 0.09],
  [0.09, 0.15],
  [0.15, 0.22],
  [0.22, 1],
];

/** The day's puzzle: maps until the obvious play's shortfall fits the weekday's difficulty. */
export function buildDay(day: number) {
  const level = DIFFICULTY[weekdayOf(day)];
  const [lo, hi] = GAP_BAND[level];
  const target = (lo + Math.min(hi, 0.35)) / 2;
  let pick: { layout: Layout; optimal: number; solution: Placement[]; obvious: number; gap: number } | null = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const layout = generate(day, attempt);
    const s = solve(layout);
    const g = greedy(layout).score;
    const gap = (s.score - g) / s.score;
    const cand = { layout, optimal: s.score, solution: s.placements, obvious: g, gap };
    if (gap >= lo && gap < hi) return cand;
    if (!pick || Math.abs(gap - target) < Math.abs(pick.gap - target)) pick = cand;
  }
  return pick!;
}

export const medalFor = (score: number, optimal: number) =>
  score >= optimal ? "perfect" : score >= optimal * 0.9 ? "gold" : score >= optimal * 0.75 ? "silver" : score >= optimal * 0.6 ? "bronze" : null;
export const thresholds = (optimal: number) => ({
  bronze: Math.ceil(optimal * 0.6),
  silver: Math.ceil(optimal * 0.75),
  gold: Math.ceil(optimal * 0.9),
  perfect: optimal,
});
