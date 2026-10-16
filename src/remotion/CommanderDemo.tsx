import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CELLS, SIZE, TREE, WALL, WATER, ownable, reach, simulate, trail, xy, type Layout, type Placement } from "../lib/commander/engine";
import { TroopIcon } from "../components/commander/icons";

// How-to-play demo for /commander (website only): a square, silent loop that
// plays a small hand-made map with the real engine. Each rule gets its moment —
// the Commander's ground, an arrow over a wall stopped by a tree, a soldier
// wading water — then a chain of moves on newly taken ground.

const I = (x: number, y: number) => y * SIZE + x;
const T = (pts: [number, number][], t: number, terrain: number[]) => pts.forEach(([x, y]) => (terrain[I(x, y)] = t));
const terrain = new Array<number>(CELLS).fill(0);
T([[2, 7], [8, 2], [1, 3], [9, 9], [6, 3], [0, 10]], TREE, terrain);
T([[6, 7], [1, 1], [2, 1], [3, 1], [9, 5], [9, 6]], WALL, terrain);
T([[3, 6], [10, 4], [10, 5], [10, 3], [4, 10], [5, 10]], WATER, terrain);
const LAYOUT: Layout = { day: 0, weekday: 1, terrain, commander: I(5, 8), troops: { archer: 3, soldier: 3 } };
const MOVES: Placement[] = [
  { i: I(4, 7), kind: "archer" },
  { i: I(3, 7), kind: "soldier" },
  { i: I(3, 5), kind: "archer" },
  { i: I(7, 7), kind: "soldier" },
  { i: I(5, 5), kind: "archer" },
  { i: I(8, 5), kind: "soldier" },
];
const BEST = 35;

const FPS = 30;
const s = (sec: number) => Math.round(sec * FPS);
const T_COMMANDER = s(1.6);
const MOVE_AT = [s(4.6), s(9.6), s(15.2), s(16.6), s(18), s(19.4)];
const T_END = s(21.6);
export const COMMANDER_DEMO_SECONDS = 27;

const CAPTIONS: { from: number; to: number; text: string }[] = [
  { from: T_COMMANDER, to: MOVE_AT[0] - 4, text: "Your Commander starts with the ground around it." },
  { from: MOVE_AT[0], to: MOVE_AT[1] - 4, text: "Archers take 3 left and 3 right. Arrows fly over walls — a tree stops them." },
  { from: MOVE_AT[1], to: MOVE_AT[2] - 4, text: "Soldiers take 2 up and 2 down. They wade through water — walls stop them." },
  { from: MOVE_AT[2], to: T_END - 4, text: "Troops only stand on ground you hold — so the order you place them matters." },
];

const ENEMY = "#d23b3b";
const ME = "#356fd0";
const STEP = 5; // frames between squares along a troop's reach

// When does each square turn blue? Commander's 3×3 first, then each move's reach, square by square.
const flipAt = new Array<number>(CELLS).fill(Infinity);
const trailDir = new Map<number, { at: number; dir: string }[]>(); // per square: when each troop's mark lands
for (const t of reach(LAYOUT, LAYOUT.commander, "commander")) {
  const [x, y] = xy(t);
  const [cx, cy] = xy(LAYOUT.commander);
  flipAt[t] = Math.min(flipAt[t], T_COMMANDER + Math.max(Math.abs(x - cx), Math.abs(y - cy)) * STEP);
}
const blocked: { t: number; at: number }[] = [];
MOVES.forEach((p, k) => {
  const t0 = MOVE_AT[k] + 8;
  flipAt[p.i] = Math.min(flipAt[p.i], t0);
  const [x0, y0] = xy(p.i);
  for (const { t, dir } of trail(LAYOUT, p.i, p.kind)) {
    const [x, y] = xy(t);
    const d = Math.abs(x - x0) + Math.abs(y - y0);
    if (flipAt[t] === Infinity) flipAt[t] = t0 + d * STEP;
    trailDir.set(t, [...(trailDir.get(t) ?? []), { at: t0 + d * STEP, dir }]);
  }
  // an arrow that hits a tree: show the stop
  if (p.kind === "archer")
    for (const dx of [-1, 1])
      for (let d = 1; d <= 3; d++) {
        const x = x0 + dx * d;
        if (x < 0 || x >= SIZE) break;
        const t = I(x, y0);
        if (LAYOUT.terrain[t] === TREE) {
          blocked.push({ t, at: t0 + d * STEP });
          break;
        }
      }
});
const FINAL = simulate(LAYOUT, MOVES).score;

const chevron: Record<string, string> = {
  l: "18,50 46,24 46,36 32,50 46,64 46,76",
  r: "82,50 54,24 54,36 68,50 54,64 54,76",
  u: "50,18 76,46 64,46 50,32 36,46 24,46",
  d: "50,82 76,54 64,54 50,68 36,54 24,54",
};

export const CommanderDemo = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const BOARD = 840;
  const cell = BOARD / SIZE;

  const placed = MOVES.filter((_, k) => frame >= MOVE_AT[k]);
  let score = 0;
  for (let i = 0; i < CELLS; i++) if (frame >= flipAt[i]) score++;
  const caption = CAPTIONS.find((c) => frame >= c.from && frame < c.to);
  const intro = interpolate(frame, [0, s(0.4), s(1.2), s(1.5)], [1, 1, 1, 0], { extrapolateRight: "clamp" });
  const end = interpolate(frame, [T_END, T_END + s(0.5)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  // the tap: a finger-dot that glides to the next square just before each move
  const next = MOVE_AT.findIndex((t) => frame < t + 6);
  let tap: { x: number; y: number; press: number } | null = null;
  if (next >= 0 && frame >= MOVE_AT[next] - 14) {
    const [tx, ty] = xy(MOVES[next].i);
    const from = next > 0 ? xy(MOVES[next - 1].i) : xy(LAYOUT.commander);
    const k = interpolate(frame, [MOVE_AT[next] - 14, MOVE_AT[next] - 2], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    tap = {
      x: (from[0] + (tx - from[0]) * k + 0.5) * cell,
      y: (from[1] + (ty - from[1]) * k + 0.5) * cell,
      press: interpolate(frame, [MOVE_AT[next] - 2, MOVE_AT[next] + 2, MOVE_AT[next] + 6], [1, 0.7, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    };
  }

  return (
    <AbsoluteFill style={{ background: "#155f33", fontFamily: "'Arial Black', Arial, Helvetica, sans-serif", color: "#f6efdb" }}>
      {/* score */}
      <div style={{ position: "absolute", top: 34, width: "100%", textAlign: "center", fontSize: 54, letterSpacing: 2 }}>
        {score} <span style={{ fontSize: 30, fontFamily: "Arial, Helvetica, sans-serif", opacity: 0.85 }}>squares taken</span>
      </div>

      {/* board */}
      <div
        style={{
          position: "absolute",
          left: (1080 - BOARD) / 2,
          top: 104,
          width: BOARD,
          height: BOARD,
          display: "grid",
          gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
          gap: 3,
          padding: 3,
          background: "#0e3f22",
          boxSizing: "border-box",
          border: "6px solid #0c3c21",
        }}
      >
        {Array.from({ length: CELLS }, (_, i) => {
          const t = LAYOUT.terrain[i];
          const mine = frame >= flipAt[i];
          const pop = mine ? interpolate(frame - flipAt[i], [0, 4, 9], [1.18, 1.06, 1], { extrapolateRight: "clamp" }) : 1;
          const isCmd = i === LAYOUT.commander && frame >= T_COMMANDER;
          const troop = isCmd ? "commander" : placed.find((p) => p.i === i)?.kind;
          const dropAt = isCmd ? T_COMMANDER : MOVE_AT[MOVES.findIndex((p) => p.i === i)];
          const drop = troop ? spring({ frame: frame - dropAt, fps, config: { damping: 11, stiffness: 160 } }) : 0;
          const bg =
            t === WALL
              ? "#4a4f57"
              : t === WATER
                ? "repeating-linear-gradient(0deg, #2aa198 0 12px, #3fb7ad 12px 17px)"
                : mine
                  ? ME
                  : ENEMY;
          const mark = (trailDir.get(i) ?? []).filter((m) => frame >= m.at).pop()?.dir;
          const stop = blocked.find((b) => b.t === i && frame >= b.at && frame < b.at + s(1.6));
          return (
            <div
              key={i}
              style={{
                position: "relative",
                background: bg,
                transform: `scale(${pop})`,
                boxShadow: "inset -5px -5px 0 rgba(0,0,0,0.22), inset 5px 5px 0 rgba(255,255,255,0.12)",
              }}
            >
              {t === TREE && <div style={{ position: "absolute", inset: "18%", borderRadius: "50% 50% 40% 40%", background: "#1f7a3c", boxShadow: "inset -5px -5px 0 #16592b" }} />}
              {mine && !troop && mark && ownable(LAYOUT, i) && (
                <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: "22%", width: "56%", height: "56%" }}>
                  <polygon points={chevron[mark]} fill="rgba(255,255,255,0.6)" />
                </svg>
              )}
              {stop && (
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 64, color: "#fff", textShadow: "0 0 12px #d23b3b", opacity: interpolate(frame - stop.at, [0, 6, s(1.6)], [0, 1, 0]) }}>
                  ✕
                </div>
              )}
              {troop && (
                <div
                  style={{
                    position: "absolute",
                    inset: "7%",
                    background: "#f6efdb",
                    border: "4px solid #264f9c",
                    color: ME,
                    transform: `scale(${drop}) translateY(${(1 - drop) * -30}px)`,
                    boxShadow: "0 4px 0 rgba(0,0,0,0.35)",
                  }}
                >
                  <TroopIcon kind={troop} />
                </div>
              )}
            </div>
          );
        })}
        {tap && (
          <div
            style={{
              position: "absolute",
              left: 3 + tap.x - 26,
              top: 3 + tap.y - 26,
              width: 52,
              height: 52,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.55)",
              border: "4px solid #fff",
              transform: `scale(${tap.press})`,
            }}
          />
        )}
      </div>

      {/* caption */}
      {caption && (
        <div
          style={{
            position: "absolute",
            left: 60,
            right: 60,
            bottom: 26,
            minHeight: 72,
            display: "grid",
            placeItems: "center",
            textAlign: "center",
            fontFamily: "Arial, Helvetica, sans-serif",
            fontWeight: 700,
            fontSize: 34,
            lineHeight: 1.2,
            opacity: interpolate(frame, [caption.from, caption.from + 8, caption.to - 8, caption.to], [0, 1, 1, 0]),
          }}
        >
          {caption.text}
        </div>
      )}

      {/* title */}
      {intro > 0 && (
        <AbsoluteFill style={{ background: `rgba(10,46,26,${0.85 * intro})`, display: "grid", placeItems: "center", opacity: intro }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 110, letterSpacing: 8 }}>COMMANDER</div>
            <div style={{ fontSize: 40, fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 700, color: "#f2c14e" }}>how to play</div>
          </div>
        </AbsoluteFill>
      )}

      {/* finish */}
      {end > 0 && (
        <AbsoluteFill style={{ background: `rgba(10,46,26,${0.88 * end})`, display: "grid", placeItems: "center", opacity: end }}>
          <div style={{ textAlign: "center", fontFamily: "Arial, Helvetica, sans-serif", fontWeight: 700 }}>
            <div style={{ fontFamily: "'Arial Black', Arial, sans-serif", fontSize: 120 }}>{FINAL}</div>
            <div style={{ fontSize: 40, marginBottom: 34 }}>squares — nice run.</div>
            <div style={{ fontSize: 50, color: "#f2c14e" }}>Best possible: {BEST}.</div>
            <div style={{ fontSize: 50, color: "#f2c14e", marginBottom: 40 }}>Can you find it?</div>
            <div style={{ fontSize: 32, opacity: 0.9 }}>A new map every day · Monday easy → Friday hard</div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
