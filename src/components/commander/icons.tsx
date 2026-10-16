// Commander pieces: a little person (tunic in the team color via currentColor),
// with reach notches on the outside edges of the tile (Archer ‹ ›, Soldier ˄ ˅).
import type { Kind } from "@/lib/commander/engine";

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
  const dirs = kind === "archer" ? ["l", "r"] : ["u", "d"];
  return (
    <>
      {dirs.map((d) => (
        <span key={d} className={"cm-notch " + d} aria-hidden />
      ))}
    </>
  );
}

export function TroopIcon({ kind }: { kind: Kind }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="100%"
      height="100%"
      role="img"
      aria-label={kind === "archer" ? "Archer" : kind === "soldier" ? "Soldier" : "Commander"}
    >
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
      {kind === "commander" && (
        <>
          <Person />
          {/* banner + a little crown */}
          <line x1="14" y1="2.6" x2="14" y2="15.6" stroke={WOOD} strokeWidth="0.9" />
          <path d="M14.4 2.8 h4 l-1.1 1.6 l1.1 1.6 h-4 z" fill="#f2c14e" stroke="#c9982f" strokeWidth="0.3" />
          <path d="M8.2 4.1 l0.6 -1.4 l0.6 0.8 l0.6 -1 l0.6 1 l0.6 -0.8 l0.6 1.4 z" fill="#f2c14e" />
        </>
      )}
    </svg>
  );
}

/** A little grass tuft that sways (light shade of the tile's own color). */
export function Tuft() {
  return (
    <svg className="cm-tuft" viewBox="0 0 12 10" aria-hidden>
      <path d="M2 10 Q2.4 5 1 2.4 Q3.6 5 3.6 10 Z M5 10 Q5.3 3.6 6 0.6 Q7 3.6 6.8 10 Z M8.4 10 Q8.6 5.4 11 3 Q10 6 10 10 Z" />
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
