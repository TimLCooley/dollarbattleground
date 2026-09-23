import {
  AbsoluteFill,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

// A single "war report": the anchor clip composited into live broadcast
// graphics — RED TEAM NEWS branding, the board as on-screen footage, a
// territory-control readout, a breaking lower-third, and a scrolling war wire.
// Everything is driven by props so the War Correspondent can generate one per
// game event.

export type WarReportProps = {
  network: string; // "RED TEAM NEWS"
  accent: string; // brand color
  anchorSrc: string; // staticFile path to the HeyGen anchor clip (with audio)
  headline: string;
  subhead: string;
  redPct: number;
  bluePct: number;
  ticker: string[];
  board: ("r" | "b" | null)[]; // 225 cells; empty => auto-generate
  seconds: number;
}

const N = 15;

function autoBoard(redPct: number): ("r" | "b")[] {
  // deterministic red-leaning split for previews when no board is supplied
  const cells: ("r" | "b")[] = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < N * N; i++) cells.push(rnd() * 100 < redPct ? "r" : "b");
  return cells;
}

export const DEFAULT_PROPS: WarReportProps = {
  network: "RED TEAM NEWS",
  accent: "#d23b3b",
  anchorSrc: "_wr/anchor.mp4",
  headline: "RED FORCES SEIZE THE NORTHERN FRONT",
  subhead: "Control tips to 58% as a coordinated strike overruns four Blue-held blocks",
  redPct: 58,
  bluePct: 42,
  ticker: [
    "RED 58%",
    "BLUE 42%",
    "1,204 tiles flipped in the last 24h",
    "biggest strike: a 3×3 barrage at (7,4)",
    "$3,410 committed to the war",
    "18 new recruits enlisted this hour",
    "Blue counter-offensive forming on the eastern flank",
  ],
  board: [],
  seconds: 8,
};

export const WarReport = (props: WarReportProps) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const cells = props.board.length === N * N ? props.board : autoBoard(props.redPct);

  const lowerIn = spring({ frame: frame - 12, fps, config: { damping: 200 } });
  const lowerY = interpolate(lowerIn, [0, 1], [140, 0]);
  // Calm, readable news-ticker crawl (~65 px/sec) instead of a blur.
  const tickerX = interpolate(frame, [0, props.seconds * fps], [60, 60 - 65 * props.seconds]);
  const blink = Math.floor(frame / 15) % 2 === 0;

  const anchorW = Math.round(width * 0.4);

  return (
    <AbsoluteFill style={{ backgroundColor: "#05070f", fontFamily: "Arial, Helvetica, sans-serif" }}>
      {/* on-screen footage: the board, in the newsroom "screen" beside the anchor */}
      <div style={{ position: "absolute", left: anchorW, right: 0, top: 0, bottom: 0, overflow: "hidden" }}>
        <AbsoluteFill
          style={{
            background: "radial-gradient(120% 90% at 50% 40%, #17663a 0%, #0a2e1a 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -46%)",
            width: height * 0.56,
            height: height * 0.56,
            display: "grid",
            gridTemplateColumns: `repeat(${N}, 1fr)`,
            gap: 2,
            padding: 6,
            background: "#0c3c21",
            boxShadow: "0 12px 40px rgba(0,0,0,.5)",
          }}
        >
          {cells.map((c, i) => (
            <div
              key={i}
              style={{
                background: c === "r" ? props.accent : "#356fd0",
                borderRadius: 2,
              }}
            />
          ))}
        </div>
      </div>

      {/* anchor (with audio) on the left */}
      <div style={{ position: "absolute", top: 0, left: 0, width: anchorW, height }}>
        <OffthreadVideo
          src={staticFile(props.anchorSrc)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            boxShadow: `inset -60px 0 60px -30px #05070f`,
          }}
        />
      </div>

      {/* top bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: anchorW,
          right: 0,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 22px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 7,
              background: props.accent,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              fontSize: 22,
            }}
          >
            R
          </div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 18, letterSpacing: 1 }}>
            {props.network}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "rgba(207,16,32,.18)",
            border: "1px solid #cf1020",
            padding: "6px 12px",
            borderRadius: 20,
            color: "#fff",
            fontWeight: 800,
            letterSpacing: 2,
            fontSize: 13,
          }}
        >
          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: blink ? "#cf1020" : "rgba(207,16,32,.3)",
            }}
          />
          LIVE
        </div>
      </div>

      {/* territory control readout */}
      <div
        style={{
          position: "absolute",
          top: 78,
          right: 22,
          width: 240,
          background: "rgba(8,13,28,.72)",
          border: "1px solid rgba(120,150,200,.25)",
          borderRadius: 8,
          padding: 14,
        }}
      >
        <div style={{ color: "#9fb0d0", fontSize: 11, letterSpacing: 2, fontWeight: 700, marginBottom: 10 }}>
          TERRITORY CONTROL
        </div>
        <div style={{ display: "flex", height: 18, borderRadius: 4, overflow: "hidden" }}>
          <div style={{ width: `${props.redPct}%`, background: props.accent }} />
          <div style={{ width: `${props.bluePct}%`, background: "#356fd0" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontWeight: 800, fontSize: 15 }}>
          <span style={{ color: "#ff8f8f" }}>RED {props.redPct}%</span>
          <span style={{ color: "#9cc0ff" }}>{props.bluePct}% BLUE</span>
        </div>
      </div>

      {/* breaking lower-third */}
      <div
        style={{
          position: "absolute",
          left: anchorW - 30,
          right: 0,
          bottom: 46,
          transform: `translateY(${lowerY}px)`,
          display: "flex",
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            background: "#cf1020",
            color: "#fff",
            padding: "12px 16px",
            fontWeight: 900,
            letterSpacing: 2,
            fontSize: 15,
            display: "flex",
            alignItems: "center",
          }}
        >
          BREAKING
        </div>
        <div
          style={{
            background: "rgba(6,10,22,.94)",
            borderLeft: `4px solid ${props.accent}`,
            padding: "10px 18px",
            flex: 1,
          }}
        >
          <div style={{ color: "#fff", fontSize: 26, fontWeight: 800, lineHeight: 1.12 }}>
            {props.headline}
          </div>
          <div style={{ color: "#c7d3ea", fontSize: 14, marginTop: 3 }}>{props.subhead}</div>
        </div>
      </div>

      {/* persistent URL / call-to-action bug */}
      <div
        style={{
          position: "absolute",
          left: 16,
          bottom: 50,
          background: "#f2c14e",
          color: "#0a0f1e",
          padding: "8px 13px",
          borderRadius: 8,
          fontWeight: 900,
          fontSize: 16,
          letterSpacing: 0.3,
          boxShadow: "0 6px 18px rgba(0,0,0,.45)",
        }}
      >
        ▶ dollarbattleground.com
      </div>

      {/* war wire ticker */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 40,
          background: "#0a0f1e",
          borderTop: `2px solid #f2c14e`,
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "#f2c14e",
            color: "#0a0f1e",
            height: "100%",
            display: "flex",
            alignItems: "center",
            padding: "0 14px",
            fontWeight: 900,
            fontSize: 12,
            letterSpacing: 1,
          }}
        >
          WAR WIRE
        </div>
        <div
          style={{
            whiteSpace: "nowrap",
            transform: `translateX(${tickerX}px)`,
            color: "#dbe4f5",
            fontSize: 15,
            fontWeight: 600,
            paddingLeft: 16,
          }}
        >
          {props.ticker.join("     •     ")}
        </div>
      </div>
    </AbsoluteFill>
  );
};
