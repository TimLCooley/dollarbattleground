// Commander pieces: a little person (tunic in the team color via currentColor),
// with reach notches on the outside edges of the tile (Archer ‹ ›, Soldier ˄ ˅,
// Scout in the four corners).
import type { Kind } from "@/lib/commander/engine";
import { AUTUMN, ThanksgivingTroop } from "./art-thanksgiving";

/** Seasonal art set from the store ("thanksgiving"), or undefined for the classic look. */
export type Art = "thanksgiving" | undefined;

const SKIN = "#e8b98a";
const DARK = "#3a2a1c";
const STEEL = "#8a949e";
const WOOD = "#8a5a2b";

function Person({ helmet = false }: { helmet?: boolean }) {
  return (
    <>
      {/* legs */}
      <rect x="8.1" y="13.6" width="1.6" height="3" fill={DARK} />
      <rect x="10.3" y="13.6" width="1.6" height="3" fill={DARK} />
      {/* tunic + belt */}
      <path d="M7.4 8.6 h5.2 l0.6 5.2 h-6.4 z" fill="currentColor" />
      <rect x="7.3" y="11.4" width="5.4" height="0.9" fill={DARK} />
      {/* head + hair or helmet */}
      <circle cx="10" cy="6" r="2.3" fill={SKIN} />
      {helmet ? <path d="M7.6 6 a2.4 2.4 0 0 1 4.8 0 z" fill={STEEL} /> : <path d="M7.8 5.4 a2.3 2.3 0 0 1 4.4 0 z" fill={DARK} />}
    </>
  );
}

/** Reach markers on the outside edges of the tile: Archer ‹ ›, Soldier ˄ ˅. */
export function Notches({ kind }: { kind: Kind }) {
  if (kind === "commander") return null;
  const dirs = kind === "archer" ? ["l", "r"] : kind === "scout" ? ["ul", "ur", "dl", "dr"] : ["u", "d"];
  return (
    <>
      {dirs.map((d) => (
        <span key={d} className={"cm-notch " + d} aria-hidden />
      ))}
    </>
  );
}

export function TroopIcon({ kind, art }: { kind: Kind; art?: Art }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="100%"
      height="100%"
      role="img"
      aria-label={kind === "archer" ? "Archer" : kind === "soldier" ? "Soldier" : kind === "scout" ? "Scout" : "Commander"}
    >
      {art === "thanksgiving" ? <ThanksgivingTroop kind={kind} /> : <ClassicTroop kind={kind} />}
    </svg>
  );
}

function ClassicTroop({ kind }: { kind: Kind }) {
  return (
    <>
      {kind === "archer" && (
        <>
          <Person />
          {/* bow held out to the side, arrow nocked */}
          <path d="M14.2 6.4 Q16.8 10.2 14.2 14" fill="none" stroke={WOOD} strokeWidth="1.1" />
          <line x1="14.2" y1="6.4" x2="14.2" y2="14" stroke="#f6efdb" strokeWidth="0.4" />
          <line x1="11.6" y1="10.2" x2="16.4" y2="10.2" stroke={STEEL} strokeWidth="0.7" />
        </>
      )}
      {kind === "soldier" && (
        <>
          <Person helmet />
          {/* sword raised, shield */}
          <line x1="13.9" y1="3.6" x2="13.9" y2="11.4" stroke={STEEL} strokeWidth="1" />
          <line x1="12.8" y1="11" x2="15" y2="11" stroke={WOOD} strokeWidth="0.9" />
          <path d="M4.6 9.2 h3 v2.6 q-1.5 1.8 -3 0 z" fill={STEEL} stroke={DARK} strokeWidth="0.3" />
        </>
      )}
      {kind === "scout" && (
        <>
          <Person />
          {/* feathered cap + spyglass raised to the eye */}
          <path d="M7.6 4.6 h4.8 l-0.4 -1.2 h-4 z" fill="#4f7a3a" />
          <path d="M12 3.6 q2.2 -1.6 3 -0.4 q-1.4 0.2 -3 1.2 z" fill="#f2c14e" />
          <line x1="12.3" y1="9.4" x2="12.9" y2="6.9" stroke={SKIN} strokeWidth="1.1" />
          <rect x="11.2" y="5.4" width="4.6" height="1.4" fill={WOOD} />
          <rect x="15.6" y="5.1" width="1.6" height="2" fill={STEEL} />
        </>
      )}
      {kind === "commander" && (
        <>
          <Person />
          {/* banner + a little crown */}
          <line x1="14" y1="2.6" x2="14" y2="15.6" stroke={WOOD} strokeWidth="0.9" />
          <path d="M14.4 2.8 h4 l-1.1 1.6 l1.1 1.6 h-4 z" fill="#f2c14e" stroke="#c9982f" strokeWidth="0.3" />
          <path d="M8.2 4.1 l0.6 -1.4 l0.6 0.8 l0.6 -1 l0.6 1 l0.6 -0.8 l0.6 1.4 z" fill="#f2c14e" />
        </>
      )}
    </>
  );
}

// Two-frame pixel sprites (like enclose.horse): each flips between frame A and B.

/** Grass: '' '' standing, then ,, ,, leaning in the wind. Light shade of the tile's own color. */
type Frame = { frame?: "a" | "b"; style?: React.CSSProperties };
const show = (f: Frame["frame"], which: "a" | "b") => (f ? { opacity: f === which ? 1 : 0 } : undefined);

export function Tuft({ frame, style }: Frame = {}) {
  return (
    <svg className="cm-sprite cm-tuft" viewBox="0 0 10 6" shapeRendering="crispEdges" aria-hidden style={style}>
      <g className="fa" style={show(frame, "a")}>
        <rect x="1" y="1" width="1" height="3" />
        <rect x="3" y="1" width="1" height="3" />
        <rect x="6" y="2" width="1" height="3" />
        <rect x="8" y="2" width="1" height="3" />
      </g>
      <g className="fb" style={show(frame, "b")}>
        <rect x="1" y="2" width="1" height="2" />
        <rect x="2" y="1" width="1" height="1" />
        <rect x="3" y="2" width="1" height="2" />
        <rect x="4" y="1" width="1" height="1" />
        <rect x="6" y="3" width="1" height="2" />
        <rect x="7" y="2" width="1" height="1" />
        <rect x="8" y="3" width="1" height="2" />
        <rect x="9" y="2" width="1" height="1" />
      </g>
    </svg>
  );
}

/** Tree: the canopy rocks a pixel left and right; the trunk stays put. */
export function TreeSprite({ frame, style, art }: Frame & { art?: Art } = {}) {
  // fall colors for the Thanksgiving skin
  const [light, mid, dark] = art === "thanksgiving" ? [AUTUMN.light, AUTUMN.mid, AUTUMN.dark] : ["#2b9149", "#1f7a3c", "#16592b"];
  const canopy = (dx: number) => (
    <>
      <rect x={3 + dx} y="1" width="6" height="1" fill={light} />
      <rect x={2 + dx} y="2" width="8" height="5" fill={mid} />
      <rect x={3 + dx} y="7" width="6" height="1" fill={mid} />
      <rect x={3 + dx} y="2" width="3" height="2" fill={light} />
      <rect x={6 + dx} y="5" width="4" height="2" fill={dark} />
    </>
  );
  return (
    <svg className="cm-sprite cm-tree" viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden style={style}>
      <rect x="5" y="8" width="2" height="3" fill="#6b4524" />
      <g className="fa" style={show(frame, "a")}>{canopy(0)}</g>
      <g className="fb" style={show(frame, "b")}>{canopy(1)}</g>
    </svg>
  );
}

/** Water: two little ripples that swap places. */
export function Ripple({ frame, style }: Frame = {}) {
  const wave = (x: number, y: number) => (
    <>
      <rect x={x} y={y + 1} width="1" height="1" />
      <rect x={x + 1} y={y} width="2" height="1" />
      <rect x={x + 3} y={y + 1} width="1" height="1" />
    </>
  );
  return (
    <svg className="cm-sprite cm-ripple" viewBox="0 0 12 12" shapeRendering="crispEdges" aria-hidden style={style}>
      <g className="fa" style={show(frame, "a")}>
        {wave(1, 2)}
        {wave(6, 7)}
      </g>
      <g className="fb" style={show(frame, "b")}>
        {wave(5, 3)}
        {wave(2, 8)}
      </g>
    </svg>
  );
}

/** Deterministic per-square variety: which squares grow a tuft, and each one's animation offset. */
export const hasTuft = (i: number) => (i * 2654435761) % 7 < 3;
export const sway = (i: number) => ({ ["--d" as string]: `${((i * 37) % 23) / 10}s` }) as React.CSSProperties;

/** Wall joinery: which neighbours are walls too (so a run of wall reads as one wall), plus a mossy variant now and then. */
export function wallClass(terrain: number[], i: number, size: number, WALL: number): string {
  const x = i % size;
  const y = Math.floor(i / size);
  const c: string[] = [];
  if (x < size - 1 && terrain[i + 1] === WALL) c.push("wr");
  if (y < size - 1 && terrain[i + size] === WALL) c.push("wd");
  if ((i * 40503) % 5 === 0) c.push("moss");
  return c.join(" ");
}

/** The stone brick used for walls (same art as the CSS), for the video renderer. */
export const WALL_BRICK = (() => {
  const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40' shape-rendering='crispEdges'><rect width='40' height='40' fill='#70757d'/><g fill='#868b93'><rect x='1' y='1' width='18' height='1'/><rect x='21' y='1' width='18' height='1'/><rect x='0' y='11' width='9' height='1'/><rect x='11' y='11' width='18' height='1'/><rect x='31' y='11' width='9' height='1'/><rect x='1' y='21' width='18' height='1'/><rect x='21' y='21' width='18' height='1'/><rect x='0' y='31' width='9' height='1'/><rect x='11' y='31' width='18' height='1'/><rect x='31' y='31' width='9' height='1'/></g><g fill='#464a51'><rect y='9' width='40' height='2'/><rect y='19' width='40' height='2'/><rect y='29' width='40' height='2'/><rect y='39' width='40' height='1'/><rect x='0' y='0' width='1' height='9'/><rect x='20' y='0' width='1' height='9'/><rect x='10' y='11' width='1' height='8'/><rect x='30' y='11' width='1' height='8'/><rect x='0' y='21' width='1' height='8'/><rect x='20' y='21' width='1' height='8'/><rect x='10' y='31' width='1' height='8'/><rect x='30' y='31' width='1' height='8'/></g></svg>";
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
})();
