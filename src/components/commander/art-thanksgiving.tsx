import type { Kind } from "@/lib/commander/engine";

// Thanksgiving skin (November 2026): a turkey Commander, pumpkin Archers,
// corn-cob Soldiers and squirrel Scouts. Same 20×20 frame as the classic
// troops; each wears a scarf or tunic in the player's color (currentColor) so
// your army still reads as yours.

const BROWN = "#6b3f1f";
const BROWN_L = "#8a5a3a";
const ORANGE = "#d9822b";
const RED = "#b5402a";
const YELLOW = "#e8b53a";
const DARK = "#2e2118";
const STEEL = "#8a949e";
const WOOD = "#8a5a2b";
const GOLD = "#f2c14e";

function Turkey() {
  // tail fan: feathers radiating from the body
  const feathers = [-70, -42, -14, 14, 42, 70];
  const colors = [RED, ORANGE, YELLOW, YELLOW, ORANGE, RED];
  return (
    <>
      {feathers.map((a, k) => (
        <ellipse key={k} cx="10" cy="6.7" rx="1.8" ry="4.2" fill={colors[k]} stroke={BROWN} strokeWidth="0.35" transform={`rotate(${a} 10 11)`} />
      ))}
      {/* body + team-color scarf */}
      <ellipse cx="10" cy="12.6" rx="3.8" ry="4.3" fill={BROWN} />
      <ellipse cx="10" cy="13.6" rx="2.2" ry="2.6" fill={BROWN_L} />
      <path d="M7.4 10.2 q2.6 1.6 5.2 0 l0.3 1.1 q-2.9 1.7 -5.8 0 z" fill="currentColor" />
      {/* head, beak, wattle, eye */}
      <circle cx="10" cy="7.6" r="2" fill={BROWN_L} />
      <path d="M11.6 7.6 l1.5 0.5 l-1.5 0.5 z" fill={ORANGE} />
      <path d="M11.2 8.4 q0.6 1.6 -0.3 2.2 q-0.5 -1.1 0.3 -2.2 z" fill={RED} />
      <circle cx="10.7" cy="7.1" r="0.45" fill="#fff" />
      <circle cx="10.85" cy="7.1" r="0.22" fill={DARK} />
      {/* feet */}
      <path d="M8.6 16.6 v1.6 M11.4 16.6 v1.6 M7.9 18.2 h1.4 M10.7 18.2 h1.4" stroke={ORANGE} strokeWidth="0.6" />
      {/* the Commander's crown */}
      <path d="M8.3 5.9 l0.5 -1.4 l0.6 0.8 l0.6 -1 l0.6 1 l0.6 -0.8 l0.5 1.4 z" fill={GOLD} />
    </>
  );
}

function Pumpkin() {
  return (
    <>
      {/* a round harvest pumpkin: ribs, stem, leaf */}
      <ellipse cx="9.4" cy="11.8" rx="5.4" ry="4.6" fill={ORANGE} />
      <ellipse cx="9.4" cy="11.8" rx="3.2" ry="4.6" fill="#e8913a" />
      <ellipse cx="9.4" cy="11.8" rx="1.2" ry="4.5" fill={ORANGE} />
      <path d="M6.3 8 q-1.4 3.8 0 7.6 M12.5 8 q1.4 3.8 0 7.6" fill="none" stroke="#b8651e" strokeWidth="0.45" />
      <path d="M9 7.6 q-0.2 -2 0.9 -3 l0.6 0.5 q-0.8 1 -0.5 2.5 z" fill="#5a3b1c" />
      <path d="M10.3 6 q2 -2 3.6 -0.8 q-1.8 1.8 -3.6 0.8 z" fill="#4f8a2e" />
      {/* face + team-color scarf */}
      <circle cx="8.1" cy="10.6" r="0.6" fill="#fff" />
      <circle cx="10.7" cy="10.6" r="0.6" fill="#fff" />
      <circle cx="8.25" cy="10.7" r="0.32" fill={DARK} />
      <circle cx="10.85" cy="10.7" r="0.32" fill={DARK} />
      <path d="M8.3 12.4 q1.1 0.8 2.2 0" fill="none" stroke={DARK} strokeWidth="0.4" />
      <path d="M5.2 14.2 q4.2 1.8 8.4 0 l0.2 1.1 q-4.4 1.9 -8.8 0 z" fill="currentColor" />
      {/* bow */}
      <path d="M15 6.6 Q17.6 10.4 15 14.2" fill="none" stroke={WOOD} strokeWidth="1.1" />
      <line x1="15" y1="6.6" x2="15" y2="14.2" stroke="#f6efdb" strokeWidth="0.4" />
      <line x1="12.4" y1="10.4" x2="17.2" y2="10.4" stroke={STEEL} strokeWidth="0.7" />
    </>
  );
}

function Corn() {
  // kernels on a cob, wrapped in green husks
  // kernels fill the cob, row by row, inside its outline
  const kernels: [number, number][] = [];
  for (let r = 0; r < 9; r++) {
    const y = 4.4 + r * 1.4;
    const half = 2.6 * Math.sqrt(Math.max(0, 1 - ((y - 10) / 6.4) ** 2)) - 0.55;
    for (let x = 10 - half + (r % 2) * 0.5; x <= 10 + half + 0.01; x += 1.05) kernels.push([x, y]);
  }
  return (
    <>
      <path d="M6.3 16.8 q-1.6 -6 1.4 -10.8 q0.6 5.6 2.3 10.8 z" fill="#4f8a2e" />
      <path d="M13.7 16.8 q1.6 -6 -1.4 -10.8 q-0.6 5.6 -2.3 10.8 z" fill="#3f7524" />
      <ellipse cx="10" cy="10" rx="2.6" ry="6.4" fill={YELLOW} />
      {kernels.map(([x, y], k) => (
        <circle key={k} cx={x} cy={y} r="0.48" fill="#f2cf5b" stroke="#c99a1a" strokeWidth="0.2" />
      ))}
      {/* face + team-color belt */}
      <circle cx="9.1" cy="7.6" r="0.55" fill="#fff" />
      <circle cx="10.9" cy="7.6" r="0.55" fill="#fff" />
      <circle cx="9.2" cy="7.7" r="0.3" fill={DARK} />
      <circle cx="11" cy="7.7" r="0.3" fill={DARK} />
      <rect x="7.4" y="11.6" width="5.2" height="1.1" fill="currentColor" />
      <rect x="9" y="17" width="2" height="1.6" fill="#4f8a2e" />
      {/* sword */}
      <line x1="15" y1="3.6" x2="15" y2="11.4" stroke={STEEL} strokeWidth="1" />
      <line x1="13.9" y1="11" x2="16.1" y2="11" stroke={WOOD} strokeWidth="0.9" />
    </>
  );
}

function Squirrel() {
  return (
    <>
      {/* the big curled tail */}
      <path d="M6.8 16.6 q-4.6 -1.4 -4 -7.4 q0.6 -4.6 4.2 -4.2 q-2.4 2.4 -1.2 5.6 q1 2.6 2.6 3.4 z" fill="#b8682e" stroke={BROWN} strokeWidth="0.35" />
      <path d="M5.8 13.6 q-1.8 -2.4 -0.9 -6.2" fill="none" stroke="#d99a5a" strokeWidth="0.6" />
      {/* body + team-color scarf */}
      <ellipse cx="10.4" cy="12.6" rx="3.2" ry="4" fill={ORANGE} />
      <ellipse cx="10.8" cy="13.4" rx="1.7" ry="2.5" fill="#f0c48a" />
      <path d="M7.9 9.6 q2.6 1.3 5.2 0 l0.2 1 q-2.8 1.4 -5.6 0 z" fill="currentColor" />
      {/* head, ears, eye, nose */}
      <circle cx="10.6" cy="7.4" r="2.3" fill={ORANGE} />
      <path d="M8.8 5.8 l0.2 -2 l1.2 1.4 z M11.6 5.4 l1 -1.8 l0.4 2 z" fill={ORANGE} stroke={BROWN} strokeWidth="0.25" />
      <circle cx="11.4" cy="7" r="0.42" fill={DARK} />
      <circle cx="12.8" cy="7.9" r="0.35" fill={DARK} />
      {/* spyglass, held up */}
      <g transform="rotate(-18 12.2 9.4)">
        <rect x="12.2" y="8.9" width="2.6" height="1" fill={WOOD} />
        <rect x="14.6" y="8.7" width="2.2" height="1.4" fill={GOLD} />
        <rect x="16.6" y="8.5" width="0.6" height="1.8" fill={STEEL} />
      </g>
      <path d="M8.8 16.6 h1.4 M11 16.6 h1.4" stroke={BROWN} strokeWidth="0.8" />
    </>
  );
}

export function ThanksgivingTroop({ kind }: { kind: Kind }) {
  return kind === "commander" ? <Turkey /> : kind === "archer" ? <Pumpkin /> : kind === "soldier" ? <Corn /> : <Squirrel />;
}

/** Autumn tree canopy colors (the classic tree's shapes, fall leaves). */
export const AUTUMN = { light: "#e8b53a", mid: "#d9822b", dark: "#a8481f" };
