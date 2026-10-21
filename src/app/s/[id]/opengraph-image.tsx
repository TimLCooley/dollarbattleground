import { ImageResponse } from "next/og";
import { sharedPath } from "@/lib/commander/share";
import { TROOP_EMOJI } from "@/lib/commander/engine";

// The link-preview card for a shared path: Wordle-style rows, one per move —
// the troop, then a square for every square it took. Never where it stood.

export const alt = "A friend's CommanderBG battle plan";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STARS: Record<string, string> = { perfect: "🏰", gold: "⭐⭐⭐", silver: "⭐⭐", bronze: "⭐" };

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await sharedPath(id);
  const rows = p?.rows ?? [];
  const color = p?.side === "red" ? "#d23b3b" : "#356fd0";
  // fit every move on the card
  const cell = Math.min(52, Math.floor(430 / Math.max(1, rows.length)) - 8);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "40px 70px",
          background: "linear-gradient(160deg, #17663a 0%, #0a2e1a 100%)",
          color: "#f6efdb",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((r, k) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", width: cell + 10, fontSize: cell * 0.95, justifyContent: "center" }}>{TROOP_EMOJI[r.kind]}</div>
              {Array.from({ length: r.took }, (_, j) => (
                <div key={j} style={{ width: cell, height: cell, background: color, borderRadius: 6, boxShadow: "inset -4px -4px 0 rgba(0,0,0,0.25)" }} />
              ))}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", textAlign: "right", maxWidth: 440 }}>
          <div style={{ fontSize: 76, fontWeight: 900, color: "#f2c14e" }}>CommanderBG</div>
          <div style={{ fontSize: 48, fontWeight: 800, marginTop: 6 }}>{`#${p?.day ?? ""} ${p?.medal ? STARS[p.medal] : ""}`}</div>
          <div style={{ fontSize: 34, marginTop: 26, lineHeight: 1.3 }}>A friend&apos;s battle plan</div>
          <div style={{ fontSize: 30, marginTop: 10, opacity: 0.85, lineHeight: 1.3 }}>Play first — it unlocks after you attack</div>
          <div style={{ fontSize: 34, marginTop: 30, fontWeight: 800 }}>Tap to play ▶</div>
        </div>
      </div>
    ),
    size,
  );
}
