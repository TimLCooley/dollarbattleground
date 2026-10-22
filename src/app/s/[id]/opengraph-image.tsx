import { ImageResponse } from "next/og";
import { sharedPath } from "@/lib/commander/share";
import { BoardArt, STARS } from "@/lib/commander/board-card";

// The link-preview card for a shared path: a small copy of the sharer's final
// board with every troop numbered in order. Tapping it opens the puzzle.

export const alt = "A friend's CommanderBG battle plan";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await sharedPath(id);
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
        {p ? <BoardArt layout={p.layout} placements={p.placements} side={p.side} tile={46} colors={p.colors} /> : <div style={{ display: "flex" }} />}
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
