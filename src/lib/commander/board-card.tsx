import { SIZE, TREE, WALL, WATER, TROOP_EMOJI, simulate, type Layout, type Placement, type Troop } from "./engine";

// A shared board drawn for images (next/og): the sharer's final board — their
// squares, the enemy's, terrain, and each troop numbered in the order it went
// down. Used by the link preview and the square "Share path" picture.

const RED = "#d23b3b";
const BLUE = "#356fd0";
export const STARS: Record<string, string> = { perfect: "🏰", gold: "⭐⭐⭐", silver: "⭐⭐", bronze: "⭐" };

/** Outer size of the board for a tile size (tiles + gaps + frame). */
export const boardPx = (tile: number, gap = 4) => SIZE * (tile + gap) + gap + 12;

// seasonal skins swap the pieces (share pictures use emoji)
const THANKSGIVING: Record<string, string> = { commander: "🦃", archer: "🎃", soldier: "🌽", scout: "🐿️", tree: "🍁" };

export function BoardArt({ layout, placements, side, tile, gap = 4, colors, art }: { layout: Layout; placements: Placement[]; side: "red" | "blue"; tile: number; gap?: number; colors?: { me: string; them: string }; art?: string }) {
  const fall = art === "thanksgiving";
  const mine = colors?.me ?? (side === "red" ? RED : BLUE);
  const theirs = colors?.them ?? (side === "red" ? BLUE : RED);
  const fin = simulate(layout, placements).final;
  const order = new Map(placements.map((q, k) => [q.i, { kind: q.kind as Troop, n: k + 1 }]));
  const size = boardPx(tile, gap);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", width: size, height: size, padding: gap / 2, background: "#0e3f22", border: "6px solid #0c3c21" }}>
      {layout.terrain.map((t, i) => {
        const troop = order.get(i);
        const commander = i === layout.commander;
        const bg = t === WALL ? (fall ? "#d9b25a" : "#70757d") : t === WATER ? "#2aa198" : fin[i] ? mine : theirs;
        return (
          <div
            key={i}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: tile,
              height: tile,
              margin: gap / 2,
              background: troop || commander ? "#f6efdb" : bg,
              border: troop || commander ? `3px solid ${mine}` : "none",
              boxShadow: "inset -4px -4px 0 rgba(0,0,0,0.22)",
              fontSize: Math.round(tile * 0.6),
            }}
          >
            {fall
              ? commander ? THANKSGIVING.commander : troop ? THANKSGIVING[troop.kind] : t === TREE ? THANKSGIVING.tree : ""
              : commander ? "🚩" : troop ? TROOP_EMOJI[troop.kind] : t === TREE ? "🌲" : ""}
            {troop && (
              <div
                style={{
                  position: "absolute",
                  top: -8,
                  right: -8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 22,
                  height: 22,
                  padding: "0 4px",
                  background: "#f2c14e",
                  color: "#14331d",
                  fontSize: 15,
                  fontWeight: 900,
                  borderRadius: 3,
                }}
              >
                {String(troop.n)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
