import {
  AbsoluteFill,
  OffthreadVideo,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

// A vertical (9:16) social clip: a reporter talking, full-bleed, with a thin
// branded overlay (network bug, headline, live score, CTA). Several `variant`
// styles so the feed has variety. Prop-driven — one per game event.

export type ClipVariant = "lower" | "breaking" | "score" | "field" | "plain";

export type SocialClipProps = {
  network: string; // "RED TEAM NEWS"
  accent: string; // brand color
  anchorSrc: string; // staticFile path to the reporter clip (with audio)
  reporterName: string;
  role: "anchor" | "field" | "founder";
  headline: string;
  redPct: number;
  bluePct: number;
  locator: string; // e.g. "GRID 7,4" (field variant)
  url: string;
  variant: ClipVariant;
  seconds: number;
}

export const DEFAULT_SOCIAL_PROPS: SocialClipProps = {
  network: "RED TEAM NEWS",
  accent: "#d23b3b",
  anchorSrc: "_wr/rowan.mp4",
  reporterName: "Rowan Cross",
  role: "field",
  headline: "RED PUNCHES THROUGH THE NORTHERN LINE",
  redPct: 58,
  bluePct: 42,
  locator: "THE CENTER",
  url: "dollarbattleground.com",
  variant: "field",
  seconds: 10,
};

const Scrim = () => (
  <>
    <AbsoluteFill
      style={{ background: "linear-gradient(to bottom, rgba(0,0,0,.55) 0%, transparent 22%)" }}
    />
    <AbsoluteFill
      style={{ background: "linear-gradient(to top, rgba(0,0,0,.78) 0%, transparent 42%)" }}
    />
  </>
);

function Score({ red, blue, big }: { red: number; blue: number; big?: boolean }) {
  return (
    <div style={{ width: "100%" }}>
      <div
        style={{
          display: "flex",
          height: big ? 26 : 18,
          borderRadius: 6,
          overflow: "hidden",
          border: "2px solid rgba(255,255,255,.18)",
        }}
      >
        <div style={{ width: `${red}%`, background: "#d23b3b" }} />
        <div style={{ width: `${blue}%`, background: "#356fd0" }} />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 6,
          fontWeight: 900,
          fontSize: big ? 24 : 18,
        }}
      >
        <span style={{ color: "#ff8f8f" }}>RED {red}%</span>
        <span style={{ color: "#9cc0ff" }}>{blue}% BLUE</span>
      </div>
    </div>
  );
}

// The Developer's clips: no news dressing at all — just the person talking,
// with the site at the top.
const PlainClip = (props: SocialClipProps) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const drop = spring({ frame: frame - 4, fps, config: { damping: 200 } });
  return (
    <AbsoluteFill style={{ background: "#0a0f1e" }}>
      <OffthreadVideo src={staticFile(props.anchorSrc)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <AbsoluteFill style={{ background: "linear-gradient(to bottom, rgba(0,0,0,.5) 0%, transparent 26%)" }} />
      <div
        style={{
          position: "absolute",
          top: 44,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
          opacity: drop,
          transform: `translateY(${interpolate(drop, [0, 1], [-24, 0])}px)`,
        }}
      >
        <div style={{ color: "#fff", fontWeight: 800, fontSize: 30, letterSpacing: 0.6, textShadow: "0 2px 8px rgba(0,0,0,.8)" }}>
          {props.url}
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const SocialClip = (props: SocialClipProps) => {
  if (props.variant === "plain") return <PlainClip {...props} />;
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const letter = props.network.charAt(0);
  const rise = spring({ frame: frame - 8, fps, config: { damping: 200 } });
  const y = interpolate(rise, [0, 1], [60, 0]);
  const blink = Math.floor(frame / 15) % 2 === 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily: "Arial, Helvetica, sans-serif" }}>
      <OffthreadVideo
        src={staticFile(props.anchorSrc)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <Scrim />

      {/* top: network bug + LIVE */}
      <div
        style={{
          position: "absolute",
          top: 26,
          left: 20,
          right: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 8,
              background: props.accent,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              fontSize: 26,
            }}
          >
            {letter}
          </div>
          <div style={{ color: "#fff", fontWeight: 800, fontSize: 19, letterSpacing: 0.5, textShadow: "0 2px 6px rgba(0,0,0,.6)" }}>
            {props.network}
            {props.variant === "field" && (
              <div
                style={{
                  marginTop: 4,
                  display: "inline-block",
                  background: "#cf1020",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: 1.5,
                  padding: "3px 8px",
                  borderRadius: 4,
                }}
              >
                LIVE · {props.locator}
              </div>
            )}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            background: "rgba(207,16,32,.2)",
            border: "1px solid #cf1020",
            padding: "6px 11px",
            borderRadius: 20,
            color: "#fff",
            fontWeight: 800,
            letterSpacing: 1.5,
            fontSize: 13,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: blink ? "#cf1020" : "rgba(207,16,32,.3)" }} />
          LIVE
        </div>
      </div>

      {/* score variant: big module near the top-center */}
      {props.variant === "score" && (
        <div style={{ position: "absolute", top: 110, left: 20, right: 20 }}>
          <div style={{ color: "#fff", fontSize: 13, letterSpacing: 3, fontWeight: 700, marginBottom: 8, textAlign: "center", opacity: 0.85 }}>
            TERRITORY CONTROL
          </div>
          <Score red={props.redPct} blue={props.bluePct} big />
        </div>
      )}

      {/* bottom stack: headline + score + CTA */}
      <div style={{ position: "absolute", left: 20, right: 20, bottom: 40, transform: `translateY(${y}px)` }}>
        {props.variant === "breaking" && (
          <div
            style={{
              display: "inline-block",
              background: "#cf1020",
              color: "#fff",
              fontWeight: 900,
              letterSpacing: 2,
              fontSize: 15,
              padding: "7px 12px",
              marginBottom: 10,
            }}
          >
            BREAKING
          </div>
        )}

        {/* reporter name tag */}
        <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, opacity: 0.9, marginBottom: 6, textShadow: "0 2px 6px rgba(0,0,0,.7)" }}>
          {props.reporterName} · {props.role === "field" ? "ON THE FRONT" : props.role === "founder" ? "THE DEVELOPER" : "AT THE DESK"}
        </div>

        <div
          style={{
            color: "#fff",
            fontSize: props.variant === "score" ? 30 : 38,
            fontWeight: 900,
            lineHeight: 1.08,
            textShadow: "0 3px 10px rgba(0,0,0,.7)",
            marginBottom: 14,
          }}
        >
          {props.headline}
        </div>

        {props.variant !== "score" && (
          <div style={{ marginBottom: 14 }}>
            <Score red={props.redPct} blue={props.bluePct} />
          </div>
        )}

        <div
          style={{
            display: "inline-block",
            background: "#f2c14e",
            color: "#0a0f1e",
            fontWeight: 900,
            fontSize: 20,
            letterSpacing: 0.3,
            padding: "11px 16px",
            borderRadius: 10,
            boxShadow: "0 6px 18px rgba(0,0,0,.5)",
          }}
        >
          ▶ {props.url}
        </div>
      </div>
    </AbsoluteFill>
  );
};
