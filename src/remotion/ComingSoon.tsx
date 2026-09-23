import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

// A simple branded "coming soon" teaser — vertical, no anchor (free to render).
// The board sweeps red/blue behind a centered message + waitlist CTA. This is
// the kind of low-cost, text-only-ish post the agent reaches for pre-launch.

export type ComingSoonProps = {
  headline: string;
  tagline: string;
  url: string;
  seconds: number;
};

export const DEFAULT_COMING_SOON: ComingSoonProps = {
  headline: "COMING SOON",
  tagline: "Pay to paint the map. Red vs Blue. Winner takes the board.",
  url: "dollarbattleground.com",
  seconds: 7,
};

const N = 15;

export const ComingSoon = (props: ComingSoonProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // diagonal red/blue wave for motion
  const cells = [];
  for (let i = 0; i < N * N; i++) {
    const x = i % N;
    const y = Math.floor(i / N);
    const band = Math.sin((x + y) * 0.5 - frame * 0.12);
    cells.push(band > 0 ? "#d23b3b" : "#356fd0");
  }

  const rise = spring({ frame: frame - 10, fps, config: { damping: 200 } });
  const y = interpolate(rise, [0, 1], [50, 0]);
  const fade = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: "clamp" });
  const ctaPulse = 1 + 0.03 * Math.sin(frame * 0.2);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a2e1a", fontFamily: "Arial, Helvetica, sans-serif" }}>
      {/* board as living background */}
      <AbsoluteFill
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${N}, 1fr)`,
          gap: 3,
          padding: 16,
          opacity: 0.28,
        }}
      >
        {cells.map((c, i) => (
          <div key={i} style={{ background: c, borderRadius: 3 }} />
        ))}
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(90% 70% at 50% 45%, rgba(5,10,15,.35) 0%, rgba(5,10,15,.86) 78%)" }} />

      {/* centered message */}
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "0 44px",
          transform: `translateY(${y}px)`,
          opacity: fade,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: "#f2c14e", color: "#0a1a12", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 30 }}>
            $
          </div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 22, letterSpacing: 1 }}>
            DOLLAR BATTLEGROUND
          </div>
        </div>

        <div style={{ color: "#fff", fontWeight: 900, fontSize: 74, lineHeight: 0.98, letterSpacing: 1, textShadow: "0 4px 18px rgba(0,0,0,.6)" }}>
          {props.headline}
        </div>

        <div style={{ marginTop: 18, marginBottom: 30 }}>
          <span style={{ color: "#ff8f8f", fontWeight: 900, fontSize: 26 }}>RED</span>
          <span style={{ color: "#e6cf94", fontWeight: 700, fontSize: 24, margin: "0 12px" }}>vs</span>
          <span style={{ color: "#9cc0ff", fontWeight: 900, fontSize: 26 }}>BLUE</span>
        </div>

        <div style={{ color: "#e6dcc0", fontSize: 21, lineHeight: 1.35, maxWidth: 520, marginBottom: 34 }}>
          {props.tagline}
        </div>

        <div
          style={{
            transform: `scale(${ctaPulse})`,
            background: "#f2c14e",
            color: "#0a1a12",
            fontWeight: 900,
            fontSize: 23,
            padding: "14px 22px",
            borderRadius: 12,
            boxShadow: "0 8px 24px rgba(0,0,0,.5)",
          }}
        >
          ▶ {props.url}
        </div>
        <div style={{ color: "#cbb98a", fontSize: 15, marginTop: 14, letterSpacing: 1 }}>
          GET IN EARLY · PICK YOUR SIDE
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
