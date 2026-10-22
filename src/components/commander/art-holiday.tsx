import type { Kind } from "@/lib/commander/engine";

// Holiday skin (December 2026): Santa Commander, Elf Archers, Snowman
// Soldiers and Rudolph Scouts. Same 20×20 frame as the classic troops; each
// carries something in the player's color (currentColor) so the army reads as yours.

const RED = "#c8323c";
const WHITE = "#f7f9fb";
const DARK = "#24201c";
const SKIN = "#f0c4a0";
const GREEN = "#2f8a4a";
const BROWN = "#7a4a26";
const GOLD = "#f2c14e";
const STEEL = "#8a949e";
const WOOD = "#8a5a2b";
const ORANGE = "#e8862e";

function Santa() {
  return (
    <>
      {/* team-color sack over the shoulder */}
      <ellipse cx="5.2" cy="12.4" rx="2.6" ry="3.2" fill="currentColor" />
      <path d="M4.4 9.4 q0.8 -0.8 1.8 0" fill="none" stroke={DARK} strokeWidth="0.4" />
      {/* red suit, white trim, black belt + gold buckle */}
      <path d="M6.6 9.4 h6.8 l1 7.4 h-8.8 z" fill={RED} />
      <rect x="6.5" y="15.8" width="8" height="1.2" fill={WHITE} />
      <rect x="6.4" y="12.4" width="7.2" height="1.2" fill={DARK} />
      <rect x="9.3" y="12.2" width="1.4" height="1.6" fill="none" stroke={GOLD} strokeWidth="0.4" />
      <rect x="7.6" y="17" width="1.8" height="1.5" fill={DARK} />
      <rect x="10.6" y="17" width="1.8" height="1.5" fill={DARK} />
      {/* face, beard */}
      <circle cx="10" cy="6.4" r="2.3" fill={SKIN} />
      <path d="M7.6 6.6 q2.4 5.2 4.8 0 q-0.4 2.2 -2.4 2.6 q-2 -0.4 -2.4 -2.6 z" fill={WHITE} />
      <path d="M8.6 7.2 q1.4 -0.6 2.8 0" fill="none" stroke={WHITE} strokeWidth="0.8" />
      <circle cx="9.2" cy="5.8" r="0.3" fill={DARK} />
      <circle cx="10.8" cy="5.8" r="0.3" fill={DARK} />
      {/* hat with a white brim and pom */}
      <path d="M7.6 4.6 q2.8 -4.6 6 -2.4 l-1.4 2.4 z" fill={RED} />
      <rect x="7.3" y="4.2" width="5.6" height="1" rx="0.5" fill={WHITE} />
      <circle cx="13.8" cy="2.4" r="0.9" fill={WHITE} />
    </>
  );
}

function Elf() {
  return (
    <>
      <rect x="8.1" y="13.6" width="1.6" height="3" fill={GREEN} />
      <rect x="10.3" y="13.6" width="1.6" height="3" fill={GREEN} />
      <path d="M7.6 16.6 h2.4 l-0.4 1 h-2.4 z M10 16.6 h2.4 l0.4 1 h-2.4 z" fill={RED} />
      {/* team-color tunic with a zigzag hem */}
      <path d="M7.4 8.6 h5.2 l0.6 5.2 l-1.1 -0.8 l-1 0.8 l-1.1 -0.8 l-1 0.8 l-1.1 -0.8 l-1.1 0.8 z" fill="currentColor" />
      <rect x="7.3" y="11.4" width="5.4" height="0.9" fill={DARK} />
      {/* face, pointy ears */}
      <circle cx="10" cy="6.4" r="2.2" fill={SKIN} />
      <path d="M7.9 6 l-1.6 -0.9 l1.6 1.9 z M12.1 6 l1.6 -0.9 l-1.6 1.9 z" fill={SKIN} />
      <circle cx="9.2" cy="6.2" r="0.3" fill={DARK} />
      <circle cx="10.8" cy="6.2" r="0.3" fill={DARK} />
      {/* pointy green hat with a bell */}
      <path d="M7.7 5 q1.8 -4.8 6.4 -3.8 q-2.6 0.6 -1.9 3.8 z" fill={GREEN} />
      <circle cx="14.2" cy="1.3" r="0.7" fill={GOLD} />
      {/* bow */}
      <path d="M14.2 6.4 Q16.8 10.2 14.2 14" fill="none" stroke={WOOD} strokeWidth="1.1" />
      <line x1="14.2" y1="6.4" x2="14.2" y2="14" stroke={WHITE} strokeWidth="0.4" />
      <line x1="11.6" y1="10.2" x2="16.4" y2="10.2" stroke={STEEL} strokeWidth="0.7" />
    </>
  );
}

function Snowman() {
  return (
    <>
      <circle cx="9.6" cy="14" r="4.2" fill={WHITE} stroke="#c9d6e0" strokeWidth="0.4" />
      <circle cx="9.6" cy="7.6" r="3" fill={WHITE} stroke="#c9d6e0" strokeWidth="0.4" />
      {/* coal buttons, eyes, carrot nose */}
      <circle cx="9.6" cy="12.6" r="0.45" fill={DARK} />
      <circle cx="9.6" cy="14.6" r="0.45" fill={DARK} />
      <circle cx="8.6" cy="7.1" r="0.4" fill={DARK} />
      <circle cx="10.6" cy="7.1" r="0.4" fill={DARK} />
      <path d="M9.6 8 l2.6 0.5 l-2.6 0.5 z" fill={ORANGE} />
      {/* team-color scarf */}
      <path d="M6.8 9.8 q2.8 1.4 5.6 0 l0.2 1.1 q-3 1.5 -6 0 z" fill="currentColor" />
      <rect x="10.6" y="10.6" width="1.1" height="2.6" fill="currentColor" />
      {/* top hat */}
      <rect x="6.6" y="4.6" width="6" height="0.9" fill={DARK} />
      <rect x="7.6" y="1.6" width="4" height="3.1" fill={DARK} />
      <rect x="7.6" y="3.6" width="4" height="0.6" fill={RED} />
      {/* stick arm with a sword */}
      <path d="M12.6 11.6 l2.4 -1.2" stroke={BROWN} strokeWidth="0.5" />
      <line x1="15.2" y1="3.4" x2="15.2" y2="10.8" stroke={STEEL} strokeWidth="1" />
      <line x1="14.1" y1="10.4" x2="16.3" y2="10.4" stroke={WOOD} strokeWidth="0.9" />
    </>
  );
}

function Rudolph() {
  return (
    <>
      {/* antlers */}
      <path d="M8.2 4.6 l-1.4 -2.6 M7.4 3.2 l-1.6 0.2 M11.6 4.6 l1.4 -2.6 M12.4 3.2 l1.6 0.2" stroke={BROWN} strokeWidth="0.7" fill="none" />
      {/* body + team-color scarf */}
      <ellipse cx="10" cy="13.2" rx="3.4" ry="3.8" fill={BROWN} />
      <ellipse cx="10" cy="14" rx="1.8" ry="2.4" fill="#c49a6c" />
      <path d="M7.2 10 q2.8 1.4 5.6 0 l0.2 1.1 q-3 1.5 -6 0 z" fill="currentColor" />
      <rect x="8.4" y="16.6" width="1.2" height="2" fill={DARK} />
      <rect x="10.4" y="16.6" width="1.2" height="2" fill={DARK} />
      {/* head, ears, eyes, the red nose */}
      <ellipse cx="10" cy="7" rx="2.4" ry="2.6" fill={BROWN} />
      <path d="M7.6 5.6 l-1.4 -0.4 l1.2 1.4 z M12.4 5.6 l1.4 -0.4 l-1.2 1.4 z" fill={BROWN} />
      <circle cx="9.1" cy="6.4" r="0.35" fill={DARK} />
      <circle cx="10.9" cy="6.4" r="0.35" fill={DARK} />
      <circle cx="10" cy="8.6" r="1" fill="#e8283a" />
      <circle cx="9.7" cy="8.3" r="0.3" fill="#ff8a8a" />
      {/* spyglass */}
      <g transform="rotate(-18 12.2 10.4)">
        <rect x="12.2" y="9.9" width="2.6" height="1" fill={WOOD} />
        <rect x="14.6" y="9.7" width="2.2" height="1.4" fill={GOLD} />
        <rect x="16.6" y="9.5" width="0.6" height="1.8" fill={STEEL} />
      </g>
    </>
  );
}

export function HolidayTroop({ kind }: { kind: Kind }) {
  return kind === "commander" ? <Santa /> : kind === "archer" ? <Elf /> : kind === "soldier" ? <Snowman /> : <Rudolph />;
}

/** Snow-capped tree colors (the classic tree's shapes: white top, evergreen below). */
export const SNOWY = { light: "#f7f9fb", mid: "#1f7a3c", dark: "#16592b" };
