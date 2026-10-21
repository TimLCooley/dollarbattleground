import { ImageResponse } from "next/og";
import { sharedPath } from "@/lib/commander/share";
import { SIZE, TREE, WALL, WATER, TROOP_EMOJI, simulate, type Troop } from "@/lib/commander/engine";

// The link-preview card for a shared path: a small copy of the sharer's final
// board — their squares, the enemy's, terrain, and each troop numbered in the
// order it went down. Tapping it opens the puzzle.

export const alt = "A friend's CommanderBG battle plan";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STARS: Record<string, string> = { perfect: "🏰", gold: "⭐⭐⭐", silver: "⭐⭐", bronze: "⭐" };
const RED = "#d23b3b";
const BLUE = "#356fd0";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await sharedPath(id);
  const tile = 46;
  const gap = 4;
  const board = SIZE * (tile + gap) + gap + 12;
  const mine = p?.side === "red" ? RED : BLUE;
  const theirs = p?.side === "red" ? BLUE : RED;
  const fin = p ? simulate(p.layout, p.placements).final : null;
  const order = new Map(p?.placements.map((q, k) => [q.i, { kind: q.kind as Troop, n: k + 1 }]) ?? []);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 60px 0 40px",
          background: "linear-gradient(160deg, #17663a 0%, #0a2e1a 100%)",
          color: "#f6efdb",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", width: board, height: board, padding: gap / 2, background: "#0e3f22", border: "6px solid #0c3c21" }}>
          {p &&
            p.layout.terrain.map((t, i) => {
              const troop = order.get(i);
              const commander = i === p.layout.commander;
              const bg = t === WALL ? "#70757d" : t === WATER ? "#2aa198" : fin && fin[i] ? mine : theirs;
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
                    fontSize: 28,
                  }}
                >
                  {commander ? "🚩" : troop ? TROOP_EMOJI[troop.kind] : t === TREE ? "🌲" : ""}
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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", textAlign: "right", maxWidth: 520 }}>
          <div style={{ fontSize: 74, fontWeight: 900, color: "#f2c14e" }}>CommanderBG</div>
          <div style={{ fontSize: 48, fontWeight: 800, marginTop: 6 }}>{`#${p?.day ?? ""} ${p?.medal ? STARS[p.medal] : ""}`}</div>
          <div style={{ fontSize: 36, marginTop: 30 }}>A friend&apos;s battle plan</div>
          <div style={{ fontSize: 28, marginTop: 10, opacity: 0.85 }}>A new strategy puzzle every day</div>
          <div style={{ fontSize: 36, marginTop: 34, fontWeight: 800 }}>Tap to play ▶</div>
        </div>
      </div>
    ),
    size,
  );
}
