// The how-to-play map: used by the demo video (src/remotion/CommanderDemo.tsx)
// and the interactive tutorial (/commander/tutorial), so what people watch is
// exactly what they then play.
import { CELLS, SIZE, TREE, WALL, WATER, type Layout } from "./engine";

const I = (x: number, y: number) => y * SIZE + x;
const terrain = new Array<number>(CELLS).fill(0);
const put = (t: number, pts: [number, number][]) => pts.forEach(([x, y]) => (terrain[I(x, y)] = t));
put(TREE, [[2, 7], [8, 2], [1, 3], [9, 9], [6, 3], [0, 10]]);
put(WALL, [[6, 7], [1, 1], [2, 1], [3, 1], [9, 5], [9, 6]]);
put(WATER, [[3, 6], [10, 4], [10, 5], [10, 3], [4, 10], [5, 10]]);

export const DEMO_LAYOUT: Layout = { day: 0, weekday: 1, terrain, commander: I(5, 8), troops: { archer: 3, soldier: 3 } };
