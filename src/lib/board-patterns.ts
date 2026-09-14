// Shared board geometry — used by BOTH the client (preview/hover) and the
// server (payment verification + authoritative flips). Keeping one source of
// truth means the server derives the exact cells a purchase paints from just
// the center tile + action, so the client can never hand the server an
// arbitrary cell list.

export const N = 15;
export const TOTAL = N * N;

export type ActionKind = "flip" | "x" | "strike";

export const ACTION_AMOUNT: Record<ActionKind, number> = {
  flip: 1,
  x: 5,
  strike: 10,
};

export function idxToXY(i: number): { x: number; y: number } {
  return { x: i % N, y: Math.floor(i / N) };
}

export function xyToIdx(x: number, y: number): number {
  return y * N + x;
}

export function isValidCenter(i: unknown): i is number {
  return typeof i === "number" && Number.isInteger(i) && i >= 0 && i < TOTAL;
}

// $5 X-strike: center + four diagonals.
export function xPattern(i: number): number[] {
  const x = i % N;
  const y = Math.floor(i / N);
  const out: number[] = [];
  (
    [
      [0, 0],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const
  ).forEach(([dx, dy]) => {
    const nx = x + dx;
    const ny = y + dy;
    if (nx >= 0 && nx < N && ny >= 0 && ny < N) out.push(ny * N + nx);
  });
  return out;
}

// $10 officer airstrike: a 3×3 block.
export function strikePattern(i: number): number[] {
  const x = i % N;
  const y = Math.floor(i / N);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < N && ny >= 0 && ny < N) out.push(ny * N + nx);
    }
  }
  return out;
}

export function indicesFor(kind: ActionKind, center: number): number[] {
  return kind === "x"
    ? xPattern(center)
    : kind === "strike"
      ? strikePattern(center)
      : [center];
}

// The exact {x,y} cells a paid action paints, derived server-side.
export function cellsFor(
  kind: ActionKind,
  center: number,
): { x: number; y: number }[] {
  return indicesFor(kind, center).map(idxToXY);
}
