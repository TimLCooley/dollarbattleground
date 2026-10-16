// Commander — the daily war puzzle. Pure, shared by the page (live preview)
// and the server (scoring + the exhaustive optimal solver), so both always
// agree on what a placement is worth.

export const SIZE = 11;
export const CELLS = SIZE * SIZE;

export const GRASS = 0;
export const WALL = 1;
export const TREE = 2;
export const WATER = 3;

export const NEUTRAL = 0;
export const YOU = 1;
export const ENEMY = 2;

export type Kind = "soldier" | "ranged" | "commander";
export const KINDS: Kind[] = ["commander", "ranged", "soldier"];
export const BASE_RANGE: Record<Kind, number> = { soldier: 3, ranged: 4, commander: 1 };
export const MAX_BONUS = 2;

export type PickupKind = "crate" | "gold" | "mine";
export const PICKUP_POINTS: Record<PickupKind, number> = { crate: 3, gold: 10, mine: -5 };
export const FORT_POINTS = 5;

export type Layout = {
  day: number;
  terrain: number[]; // GRASS | WALL | TREE | WATER
  owner: number[]; // NEUTRAL | YOU | ENEMY at the start
  forts: number[]; // enemy strongpoints — fall only to 2+ troops
  pickups: { i: number; kind: PickupKind }[];
  troops: Record<Kind, number>;
};

export type Placement = { i: number; kind: Kind };

// ---------- day numbering + seeded randomness ----------

const DAY_ONE = Date.UTC(2026, 9, 15); // 2026-10-15 = Commander #1

/** Today's puzzle number in America/Denver. */
export function dayNumber(now = new Date()): number {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - DAY_ONE) / 86_400_000) + 1;
}

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

// ---------- generation ----------

const idx = (x: number, y: number) => y * SIZE + x;
export const xy = (i: number) => [i % SIZE, Math.floor(i / SIZE)] as const;

/** One candidate map for a day; `attempt` reseeds when a map is rejected. */
export function generate(day: number, attempt = 0): Layout {
  const rnd = mulberry32(day * 7919 + attempt * 104729 + 17);
  const pick = (n: number) => Math.floor(rnd() * n);
  const terrain = new Array<number>(CELLS).fill(GRASS);
  const owner = new Array<number>(CELLS).fill(NEUTRAL);

  // enemy holds the top two rows, you hold the bottom two (your deploy zone)
  for (let x = 0; x < SIZE; x++) {
    owner[idx(x, 0)] = owner[idx(x, 1)] = ENEMY;
    owner[idx(x, SIZE - 1)] = owner[idx(x, SIZE - 2)] = YOU;
  }
  // a few rocks in your lines so the deploy zone has a shape (16–18 tiles)
  const rocks = 4 + pick(3);
  for (let k = 0; k < rocks; ) {
    const i = idx(pick(SIZE), SIZE - 1 - pick(2));
    if (terrain[i] !== GRASS) continue;
    terrain[i] = rnd() < 0.5 ? WALL : TREE;
    k++;
  }

  const middle = (i: number) => {
    const y = Math.floor(i / SIZE);
    return y >= 2 && y <= SIZE - 3;
  };
  const free = (i: number) => middle(i) && terrain[i] === GRASS;
  const randMiddle = () => idx(pick(SIZE), 2 + pick(SIZE - 4));

  // a lake or two (water: soldiers can't cross, arrows fly over)
  const lakes = 1 + pick(2);
  for (let l = 0; l < lakes; l++) {
    let i = randMiddle();
    const len = 3 + pick(3);
    for (let k = 0; k < len; k++) {
      if (middle(i)) terrain[i] = WATER;
      const [x, y] = xy(i);
      const dir = pick(4);
      const nx = Math.min(SIZE - 1, Math.max(0, x + (dir === 0 ? 1 : dir === 1 ? -1 : 0)));
      const ny = Math.min(SIZE - 3, Math.max(2, y + (dir === 2 ? 1 : dir === 3 ? -1 : 0)));
      i = idx(nx, ny);
    }
  }
  // wall runs (block everything)
  const runs = 3 + pick(3);
  for (let r = 0; r < runs; r++) {
    const [x0, y0] = xy(randMiddle());
    const horiz = rnd() < 0.5;
    const len = 2 + pick(3);
    for (let k = 0; k < len; k++) {
      const x = horiz ? x0 + k : x0;
      const y = horiz ? y0 : y0 + k;
      if (x < SIZE && y <= SIZE - 3 && free(idx(x, y))) terrain[idx(x, y)] = WALL;
    }
  }
  // scattered trees (block arrows, soldiers walk through)
  const trees = 7 + pick(6);
  for (let k = 0, guard = 0; k < trees && guard < 500; guard++) {
    const i = randMiddle();
    if (!free(i)) continue;
    terrain[i] = TREE;
    k++;
  }
  // enemy forts out in the field, rows 2–5
  const forts: number[] = [];
  const nForts = 2 + pick(2);
  for (let guard = 0; forts.length < nForts && guard < 500; guard++) {
    const i = idx(pick(SIZE), 2 + pick(4));
    if (!free(i) || forts.some((f) => Math.abs(xy(f)[0] - xy(i)[0]) + Math.abs(xy(f)[1] - xy(i)[1]) < 3)) continue;
    forts.push(i);
    owner[i] = ENEMY;
  }
  // pickups on open middle ground
  const pickups: { i: number; kind: PickupKind }[] = [];
  const want: PickupKind[] = ["gold", "crate", "crate", "mine", ...(rnd() < 0.5 ? (["mine"] as PickupKind[]) : [])];
  for (let guard = 0; pickups.length < want.length && guard < 500; guard++) {
    const i = randMiddle();
    if (terrain[i] !== GRASS || owner[i] !== NEUTRAL || pickups.some((p) => p.i === i)) continue;
    pickups.push({ i, kind: want[pickups.length] });
  }
  return { day, terrain, owner, forts, pickups, troops: { soldier: 3, ranged: 2, commander: 1 } };
}

export const deployZone = (L: Layout) =>
  L.owner.map((o, i) => (o === YOU && L.terrain[i] === GRASS ? i : -1)).filter((i) => i >= 0);

// ---------- reach (who takes which tiles) ----------

const ownable = (L: Layout, i: number) => L.terrain[i] === GRASS || L.terrain[i] === TREE;
const isFort = (L: Layout) => {
  const s = new Uint8Array(CELLS);
  for (const f of L.forts) s[f] = 1;
  return s;
};
const NB = (i: number) => {
  const [x, y] = xy(i);
  const out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < SIZE - 1) out.push(i + 1);
  if (y > 0) out.push(i - SIZE);
  if (y < SIZE - 1) out.push(i + SIZE);
  return out;
};
const NEIGHBORS: number[][] = Array.from({ length: CELLS }, (_, i) => NB(i));

/** Tiles a troop of `kind` at `i` with range `r` takes. */
export function reach(L: Layout, i: number, kind: Kind, r: number, fort = isFort(L)): number[] {
  const out: number[] = [];
  if (kind === "soldier") {
    // march up to r steps; walls and water stop it, a fort is reached but not passed
    const dist = new Int16Array(CELLS).fill(-1);
    dist[i] = 0;
    const q = [i];
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      out.push(c);
      if (dist[c] === r || (fort[c] && c !== i)) continue;
      for (const n of NEIGHBORS[c]) {
        if (dist[n] >= 0 || !ownable(L, n)) continue;
        dist[n] = dist[c] + 1;
        q.push(n);
      }
    }
  } else if (kind === "ranged") {
    out.push(i);
    const [x0, y0] = xy(i);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let k = 1; k <= r; k++) {
        const x = x0 + dx * k;
        const y = y0 + dy * k;
        if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) break;
        const t = idx(x, y);
        if (L.terrain[t] === WALL || L.terrain[t] === TREE) break; // shot stopped
        if (L.terrain[t] === WATER) continue; // flies over
        out.push(t);
        if (fort[t]) break;
      }
    }
  } else {
    const [x0, y0] = xy(i);
    for (let y = Math.max(0, y0 - r); y <= Math.min(SIZE - 1, y0 + r); y++)
      for (let x = Math.max(0, x0 - r); x <= Math.min(SIZE - 1, x0 + r); x++) if (ownable(L, idx(x, y))) out.push(idx(x, y));
  }
  return out;
}

/** Range bonus from standing next to others: +1 next to any troop, +1 more next to the Commander (max +2). */
export function bonuses(placements: Placement[]): number[] {
  const at = new Map(placements.map((p) => [p.i, p.kind]));
  return placements.map((p) => {
    let b = 0;
    let any = false;
    let cmd = false;
    for (const n of NEIGHBORS[p.i]) {
      const k = at.get(n);
      if (!k) continue;
      any = true;
      if (k === "commander") cmd = true;
    }
    if (any) b++;
    if (cmd) b++;
    return Math.min(MAX_BONUS, b);
  });
}

// ---------- scoring ----------

export type Result = {
  final: Uint8Array; // 1 = yours at the end
  taken: number[]; // tiles gained by troops
  encircled: number[]; // tiles gained by encircling
  fortsTaken: number[];
  pickups: { i: number; kind: PickupKind; points: number }[];
  tiles: number;
  score: number;
  ranges: number[];
};

/** Precomputed reach for every (tile, kind, range) — the solver's hot path. */
export type ReachTable = Map<string, number[]>;
export function reachTable(L: Layout): ReachTable {
  const fort = isFort(L);
  const t: ReachTable = new Map();
  for (const i of deployZone(L))
    for (const kind of KINDS) for (let b = 0; b <= MAX_BONUS; b++) t.set(`${i}:${kind}:${b}`, reach(L, i, kind, BASE_RANGE[kind] + b, fort));
  return t;
}

export function validate(L: Layout, placements: Placement[]): string | null {
  const zone = new Set(deployZone(L));
  const seen = new Set<number>();
  const count: Record<Kind, number> = { soldier: 0, ranged: 0, commander: 0 };
  for (const p of placements) {
    if (!KINDS.includes(p.kind)) return "unknown troop";
    if (!zone.has(p.i)) return "troops deploy only in your lines";
    if (seen.has(p.i)) return "one troop per tile";
    seen.add(p.i);
    count[p.kind]++;
  }
  for (const k of KINDS) if (count[k] > L.troops[k]) return `too many ${k}s`;
  return null;
}

export function simulate(L: Layout, placements: Placement[], table?: ReachTable): Result {
  const fort = isFort(L);
  const final = new Uint8Array(CELLS);
  for (let i = 0; i < CELLS; i++) if (L.owner[i] === YOU && ownable(L, i)) final[i] = 1;
  const start = final.slice();
  const fortHits = new Map<number, number>();
  const bon = bonuses(placements);
  const ranges: number[] = [];
  placements.forEach((p, k) => {
    const r = BASE_RANGE[p.kind] + bon[k];
    ranges.push(r);
    const tiles = table?.get(`${p.i}:${p.kind}:${bon[k]}`) ?? reach(L, p.i, p.kind, r, fort);
    for (const t of tiles) {
      if (fort[t]) fortHits.set(t, (fortHits.get(t) ?? 0) + 1);
      else final[t] = 1;
    }
  });
  const fortsTaken: number[] = [];
  for (const [f, n] of fortHits) if (n >= 2) {
    final[f] = 1;
    fortsTaken.push(f);
  }
  const taken: number[] = [];
  for (let i = 0; i < CELLS; i++) if (final[i] && !start[i]) taken.push(i);

  // encircle: whatever the enemy can no longer reach (through ground that
  // isn't yours, not across walls/water) falls to you
  const seen = new Uint8Array(CELLS);
  const q: number[] = [];
  for (let i = 0; i < CELLS; i++) if (L.owner[i] === ENEMY && !final[i] && ownable(L, i)) {
    seen[i] = 1;
    q.push(i);
  }
  for (let h = 0; h < q.length; h++)
    for (const n of NEIGHBORS[q[h]]) if (!seen[n] && !final[n] && ownable(L, n)) {
      seen[n] = 1;
      q.push(n);
    }
  const encircled: number[] = [];
  for (let i = 0; i < CELLS; i++) if (ownable(L, i) && !final[i] && !seen[i]) {
    final[i] = 1;
    encircled.push(i);
    if (fort[i]) fortsTaken.push(i);
  }

  const pickups = L.pickups.filter((p) => final[p.i]).map((p) => ({ ...p, points: PICKUP_POINTS[p.kind] }));
  const tiles = taken.length + encircled.length;
  const score = tiles + fortsTaken.length * FORT_POINTS + pickups.reduce((s, p) => s + p.points, 0);
  return { final, taken, encircled, fortsTaken, pickups, tiles, score, ranges };
}

// ---------- the exact optimum ----------

function* combos(arr: number[], k: number, start = 0, acc: number[] = []): Generator<number[]> {
  if (acc.length === k) {
    yield acc.slice();
    return;
  }
  for (let i = start; i <= arr.length - (k - acc.length); i++) {
    acc.push(arr[i]);
    yield* combos(arr, k, i + 1, acc);
    acc.pop();
  }
}

/** Every legal full deployment, scored; returns the best. Server-side only (~seconds). */
export function solve(L: Layout): { score: number; placements: Placement[]; checked: number } {
  const zone = deployZone(L);
  const table = reachTable(L);
  let best = { score: -Infinity, placements: [] as Placement[] };
  let checked = 0;
  const nC = L.troops.commander;
  const nR = L.troops.ranged;
  const nS = L.troops.soldier;
  for (const c of combos(zone, nC)) {
    const rest1 = zone.filter((i) => !c.includes(i));
    for (const r of combos(rest1, nR)) {
      const rest2 = rest1.filter((i) => !r.includes(i));
      for (const s of combos(rest2, nS)) {
        const pl: Placement[] = [
          ...c.map((i) => ({ i, kind: "commander" as Kind })),
          ...r.map((i) => ({ i, kind: "ranged" as Kind })),
          ...s.map((i) => ({ i, kind: "soldier" as Kind })),
        ];
        const res = simulate(L, pl, table);
        checked++;
        if (res.score > best.score) best = { score: res.score, placements: pl };
      }
    }
  }
  return { ...best, checked };
}

export const medalFor = (score: number, optimal: number) =>
  score >= optimal ? "perfect" : score >= optimal * 0.9 ? "gold" : score >= optimal * 0.75 ? "silver" : score >= optimal * 0.6 ? "bronze" : null;
export const thresholds = (optimal: number) => ({
  bronze: Math.ceil(optimal * 0.6),
  silver: Math.ceil(optimal * 0.75),
  gold: Math.ceil(optimal * 0.9),
  perfect: optimal,
});

/** One troop at a time, best spot each — the "obvious" play a good puzzle should beat. */
export function greedy(L: Layout): number {
  const zone = deployZone(L);
  const order: Kind[] = [];
  for (const k of KINDS) for (let n = 0; n < L.troops[k]; n++) order.push(k);
  const pl: Placement[] = [];
  for (const kind of order) {
    let best = -Infinity;
    let bi = -1;
    for (const i of zone) {
      if (pl.some((p) => p.i === i)) continue;
      const sc = simulate(L, [...pl, { i, kind }]).score;
      if (sc > best) {
        best = sc;
        bi = i;
      }
    }
    pl.push({ i: bi, kind });
  }
  return simulate(L, pl).score;
}

/** The day's puzzle: try a few maps, keep the first where clever play clearly beats greedy. */
export function buildDay(day: number) {
  let pick: { layout: Layout; optimal: number; solution: Placement[]; gap: number } | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const layout = generate(day, attempt);
    const z = deployZone(layout).length;
    if (z < 14 || z > 18) continue;
    const s = solve(layout);
    const g = greedy(layout);
    const gap = s.score - g;
    if (!pick || gap > pick.gap) pick = { layout, optimal: s.score, solution: s.placements, gap };
    if (s.score >= 30 && g <= s.score * 0.88) break;
  }
  if (!pick) {
    const layout = generate(day, 99);
    const s = solve(layout);
    pick = { layout, optimal: s.score, solution: s.placements, gap: 0 };
  }
  return pick;
}
