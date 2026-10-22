import { ImageResponse } from "next/og";
import { sharedPath } from "@/lib/commander/share";
import { BoardArt, STARS, boardPx } from "@/lib/commander/board-card";

// The square "Share path" picture (Tim, 2026-10-21): the board alone, with a
// thin CommanderBG strip and "Play at commanderbg.com" (a picture can't carry a link).

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await sharedPath(id);
  if (!p) return new Response("not found", { status: 404 });
  const tile = 44;
  const board = boardPx(tile);
  const pad = 20;
  const strip = 56;
  const foot = 44; // the picture has no link, so it says where to play
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: pad,
          background: "#0a2e1a",
          color: "#f6efdb",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", width: board, height: strip, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 900, color: "#f2c14e" }}>CommanderBG</div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 800 }}>{`#${p.day} ${p.medal ? STARS[p.medal] : ""}`}</div>
        </div>
        <BoardArt layout={p.layout} placements={p.placements} side={p.side} tile={tile} colors={p.colors} art={p.art} />
        <div style={{ display: "flex", height: foot, alignItems: "flex-end", fontSize: 26, fontWeight: 800 }}>Play at commanderbg.com</div>
      </div>
    ),
    { width: board + pad * 2, height: board + pad * 2 + strip + foot, headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
