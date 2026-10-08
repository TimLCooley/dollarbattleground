import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

// A free clip: no talking head, no HeyGen. The live map draws itself in,
// a headline, two or three lines in the side's voice, the score, and the
// JOIN THE BATTLE card. Vertical, 10-14 s. Variants: "dispatch" (a side's
// daily map report) and "launch" (the battle has begun — neutral, both sides).

export type DispatchProps = {
  variant: "dispatch" | "launch";
  side: "red" | "blue" | null; // null = neutral (launch)
  headline: string;
  lines: string[]; // 2-3 short lines
  board: ("r" | "b" | null)[]; // 225 cells
  redPct: number;
  bluePct: number;
  openSpots: number | null; // founding officer spots still open
  url: string;
  seconds: number;
};

export const DEFAULT_DISPATCH: DispatchProps = {
  variant: "dispatch",
  side: "red",
  headline: "RED IS THIN ON THE EAST",
  lines: ["Blue pushed north overnight.", "Red's holding the middle, thin on the east.", "100 founding officer spots open."],
  board: [],
  redPct: 50,
  bluePct: 50,
  openSpots: 100,
  url: "dollarbattleground.com",
  seconds: 12,
};

const N = 15;
const RED = "#d23b3b";
const BLUE = "#356fd0";
const GOLD = "#f2c14e";

function autoBoard(redPct: number): ("r" | "b")[] {
  const cells: ("r" | "b")[] = [];
  let seed = 11;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < N * N; i++) cells.push(rnd() * 100 < redPct ? "r" : "b");
  return cells;
}

export const Dispatch = (props: DispatchProps) => {
  const frame = useCurrentFrame();
  const { fps, width, durationInFrames } = useVideoConfig();
  const cells = props.board.length === N * N ? props.board : autoBoard(props.redPct);
  const accent = props.side === "blue" ? BLUE : props.side === "red" ? RED : GOLD;
  const launch = props.variant === "launch";

  // The map fills in cell by cell over the first ~1.6 s, in a scattered order.
  const order = cells.map((_, i) => i).sort((a, b) => ((a * 7919) % 225) - ((b * 7919) % 225));
  const fillFrames = Math.round(1.6 * fps);
  const shown = Math.min(cells.length, Math.floor((frame / fillFrames) * cells.length));
  const visible = new Set(order.slice(0, shown));

  const head = spring({ frame: frame - Math.round(1.2 * fps), fps, config: { damping: 200 } });
  const lineAt = (i: number) => spring({ frame: frame - Math.round((2.0 + i * 1.1) * fps), fps, config: { damping: 200 } });
  const outroStart = Math.max(0, durationInFrames - Math.round(2.4 * fps));
  const outro = spring({ frame: frame - outroStart, fps, config: { damping: 18, stiffness: 120 } });
  const inOutro = frame >= outroStart;
  const pulse = 1 + 0.02 * Math.sin((frame / fps) * 2 * Math.PI * 0.6);

  const mapSize = Math.round(width * 0.86);

  return (
    <AbsoluteFill style={{ background: "radial-gradient(120% 90% at 50% 30%, #17663a 0%, #0a2e1a 100%)", fontFamily: "Arial, Helvetica, sans-serif", color: "#fff" }}>
      {/* kicker + headline */}
      <div style={{ position: "absolute", top: 150, left: 36, right: 36 }}>
        <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 4, color: accent, opacity: head }}>
          {launch ? "◆ DAY ONE ◆" : `◆ ${props.side === "blue" ? "BLUE" : "RED"} DISPATCH ◆`}
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: launch ? 58 : 46,
            lineHeight: 1.02,
            fontWeight: 900,
            letterSpacing: 0.5,
            textShadow: "0 4px 14px rgba(0,0,0,.6)",
            opacity: head,
            transform: `translateY(${interpolate(head, [0, 1], [24, 0])}px)`,
          }}
        >
          {props.headline}
        </div>
      </div>

      {/* the map */}
      <div
        style={{
          position: "absolute",
          top: 360,
          left: "50%",
          transform: `translateX(-50%) scale(${pulse})`,
          width: mapSize,
          height: mapSize,
          display: "grid",
          gridTemplateColumns: `repeat(${N}, 1fr)`,
          gap: 3,
          padding: 8,
          background: "#0c3c21",
          borderRadius: 8,
          boxShadow: "0 16px 50px rgba(0,0,0,.55)",
        }}
      >
        {cells.map((c, i) => (
          <div
            key={i}
            style={{
              background: !visible.has(i) ? "#e6cf94" : c === "r" ? RED : c === "b" ? BLUE : "#e6cf94",
              borderRadius: 2,
              transition: "none",
            }}
          />
        ))}
      </div>

      {/* score bar */}
      <div style={{ position: "absolute", top: 360 + mapSize + 26, left: 50, right: 50 }}>
        <div style={{ display: "flex", height: 16, borderRadius: 8, overflow: "hidden", boxShadow: "0 4px 12px rgba(0,0,0,.4)" }}>
          <div style={{ width: `${props.redPct}%`, background: RED }} />
          <div style={{ flex: 1, background: BLUE }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 20, fontWeight: 900, letterSpacing: 1 }}>
          <span style={{ color: "#ff8a8a" }}>RED {props.redPct}%</span>
          <span style={{ color: "#8ab4ff" }}>BLUE {props.bluePct}%</span>
        </div>
      </div>

      {/* the lines */}
      <div style={{ position: "absolute", top: 360 + mapSize + 92, left: 40, right: 40, display: "flex", flexDirection: "column", gap: 10 }}>
        {props.lines.slice(0, 3).map((l, i) => (
          <div
            key={i}
            style={{
              fontSize: 27,
              fontWeight: 700,
              lineHeight: 1.2,
              textShadow: "0 2px 8px rgba(0,0,0,.6)",
              opacity: inOutro ? 1 - outro : lineAt(i),
              transform: `translateY(${interpolate(lineAt(i), [0, 1], [16, 0])}px)`,
            }}
          >
            {l}
          </div>
        ))}
      </div>

      {/* closing card */}
      {inOutro && (
        <>
          <AbsoluteFill style={{ background: "rgba(0,0,0,.6)", opacity: outro }} />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: "50%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              opacity: outro,
              transform: `translateY(${interpolate(outro, [0, 1], [40, 0])}px) scale(${interpolate(outro, [0, 1], [0.92, 1])})`,
            }}
          >
            <span style={{ fontSize: 42, fontWeight: 900, letterSpacing: 4, color: accent, textShadow: "0 3px 12px rgba(0,0,0,.9)" }}>
              {launch ? "THE BATTLE HAS BEGUN" : "JOIN THE BATTLE"}
            </span>
            {props.openSpots != null && props.openSpots > 0 && (
              <span style={{ fontSize: 20, fontWeight: 700, color: "#efe4c4", letterSpacing: 1 }}>{props.openSpots} FOUNDING OFFICER SPOTS OPEN</span>
            )}
            <span style={{ fontSize: 40, fontWeight: 900, color: "#0a0f1e", background: GOLD, padding: "12px 24px", borderRadius: 14, boxShadow: "0 10px 30px rgba(0,0,0,.5)" }}>{props.url}</span>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
};
