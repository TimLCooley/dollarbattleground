import {
  AbsoluteFill,
  Audio,
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
//
// Every overlay stays inside SAFE: the feeds draw their own chrome over the
// top band (search bar, back / menu buttons), the bottom band (account,
// caption, action row, music) and the right rail (like / comment / share).
// X, TikTok, Reels and Shorts all cover about the same ground; this is the
// union, so one render reads on all of them. Render with `safeGuide: true` in
// the Studio to see the covered bands.

// The frame is 720 × 1280. Values in px.
export const SAFE = {
  top: 180, // 14% — search bar, back / menu, "Following | For You"
  bottom: 410, // 32% — account, caption, action row, music strip
  right: 100, // 14% — the vertical rail of icons (from ~40% down to ~92%)
  left: 24,
  railTop: 0.4, // the rail runs from here…
  railBottom: 0.92, // …to here, as fractions of the height
};

export type ClipVariant = "lower" | "breaking" | "score" | "field" | "plain" | "recruiter";

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
  bedSrc?: string | null; // a quiet song under the voice (staticFile path)
  bedVolume?: number;
  safeGuide?: boolean; // Studio only: draw the bands the feeds cover
  // recruiter variant: the Developer fronting a side — the officer commissions pitch
  side?: "red" | "blue";
  commissionsOpen?: number;
  commissionsLeft?: number;
  daysLeft?: number | null;
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

// Darkens where the text sits now: under the bug (top ~14–24%) and behind the
// lower-third stack (~45–70%), not the bottom edge nobody sees.
const Scrim = () => (
  <>
    <AbsoluteFill
      style={{ background: "linear-gradient(to bottom, rgba(0,0,0,.6) 0%, rgba(0,0,0,.45) 18%, transparent 30%)" }}
    />
    <AbsoluteFill
      style={{
        background:
          "linear-gradient(to top, rgba(0,0,0,.35) 0%, rgba(0,0,0,.72) 30%, rgba(0,0,0,.72) 50%, transparent 66%)",
      }}
    />
  </>
);

// The bands the feeds cover, for checking a layout in the Studio.
const SafeGuide = () => {
  const band: React.CSSProperties = {
    position: "absolute",
    background: "rgba(255,0,0,.28)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    outline: "2px dashed rgba(255,80,80,.9)",
    outlineOffset: -2,
  };
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ ...band, top: 0, left: 0, right: 0, height: SAFE.top }}>FEED CHROME — TOP</div>
      <div style={{ ...band, bottom: 0, left: 0, right: 0, height: SAFE.bottom }}>FEED CHROME — CAPTION / ACTIONS</div>
      <div
        style={{
          ...band,
          right: 0,
          width: SAFE.right,
          top: `${SAFE.railTop * 100}%`,
          bottom: `${(1 - SAFE.railBottom) * 100}%`,
          writingMode: "vertical-rl",
        }}
      >
        RAIL
      </div>
    </AbsoluteFill>
  );
};

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
  const { fps, durationInFrames } = useVideoConfig();
  const drop = spring({ frame: frame - 4, fps, config: { damping: 200 } });
  // a slow breathe so the eye catches it without it shouting
  const breathe = 1 + 0.025 * Math.sin((frame / fps) * 2 * Math.PI * 0.45);
  // the closing card: when he stops talking and they're still looking
  const outroStart = Math.max(0, durationInFrames - Math.round(2.4 * fps));
  const outro = spring({ frame: frame - outroStart, fps, config: { damping: 18, stiffness: 120 } });
  const inOutro = frame >= outroStart;
  return (
    <AbsoluteFill style={{ background: "#0a0f1e" }}>
      <Bed {...props} />
      <OffthreadVideo src={staticFile(props.anchorSrc)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      {/* Upper-left, just under the feed's top band, clear of the rail. */}
      <div
        style={{
          position: "absolute",
          top: SAFE.top + 16,
          left: SAFE.left,
          opacity: inOutro ? 1 - outro : drop,
          transform: `translateX(${interpolate(drop, [0, 1], [-24, 0])}px) scale(${breathe})`,
          transformOrigin: "left center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            flexDirection: "column",
            background: "rgba(10,15,30,.6)",
            color: "#fff",
            padding: "8px 14px 9px",
            borderRadius: 12,
            textShadow: "0 2px 8px rgba(0,0,0,.8)",
            boxShadow: "0 6px 18px rgba(0,0,0,.35)",
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: 2.2, color: "#f2c14e", marginBottom: 2 }}>CHECK OUT</span>
          <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: 0.5 }}>{props.url}</span>
        </div>
      </div>

      {/* closing card */}
      {inOutro && (
        <>
          <AbsoluteFill style={{ background: "rgba(10,15,30,.45)", opacity: outro }} />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: SAFE.right,
              top: "46%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              opacity: outro,
              transform: `translateY(${interpolate(outro, [0, 1], [40, 0])}px) scale(${interpolate(outro, [0, 1], [0.92, 1])})`,
            }}
          >
            <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3, color: "#f2c14e", textShadow: "0 2px 10px rgba(0,0,0,.8)" }}>CHECK IT OUT</span>
            <span
              style={{
                fontSize: 44,
                fontWeight: 900,
                color: "#fff",
                background: "rgba(10,15,30,.7)",
                padding: "12px 24px",
                borderRadius: 16,
                textShadow: "0 3px 12px rgba(0,0,0,.8)",
                boxShadow: "0 10px 30px rgba(0,0,0,.45)",
              }}
            >
              {props.url}
            </span>
          </div>
        </>
      )}
      {props.safeGuide && <SafeGuide />}
    </AbsoluteFill>
  );
};

// The Developer, recruiting for a side: no news dressing — him, his colour,
// and the one number that matters (officer commissions still open). Same
// SAFE box as everything else.
const RecruiterClip = (props: SocialClipProps) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const side = props.side ?? "red";
  const SIDE = side.toUpperCase();
  const accent = side === "red" ? "#d23b3b" : "#356fd0";
  const open = props.commissionsOpen ?? 100;
  const left = Math.max(0, Math.min(open, props.commissionsLeft ?? open));
  const drop = spring({ frame: frame - 4, fps, config: { damping: 200 } });
  // The lower third waits: just him talking first, the graphic comes in
  // around 10 s (or 60% through a shorter clip) — Tim: "weird being there the whole time".
  const showAt = Math.round(Math.min(10 * fps, durationInFrames * 0.6));
  const rise = spring({ frame: frame - showAt, fps, config: { damping: 200 } });
  const shown = frame >= showAt;
  // the counter fills from zero so the eye lands on it
  const fill = spring({ frame: frame - showAt - 8, fps, config: { damping: 30, stiffness: 60 } });
  const shownLeft = Math.round(left * Math.min(1, fill));
  const outroStart = Math.max(0, durationInFrames - Math.round(2.2 * fps));
  const outro = spring({ frame: frame - outroStart, fps, config: { damping: 18, stiffness: 120 } });
  const inOutro = frame >= outroStart;
  const dressing = inOutro ? 1 - outro : 1;
  return (
    <AbsoluteFill style={{ background: "#0a0f1e", fontFamily: "Arial, Helvetica, sans-serif" }}>
      <OffthreadVideo src={staticFile(props.anchorSrc)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <AbsoluteFill
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,.35) 0%, rgba(0,0,0,.7) 30%, rgba(0,0,0,.7) 50%, transparent 66%)",
          opacity: shown ? rise * dressing : 0,
        }}
      />

      {/* top: the side he's on, under the feed's top band */}
      <div
        style={{
          position: "absolute",
          top: SAFE.top,
          left: SAFE.left,
          display: "flex",
          alignItems: "center",
          gap: 10,
          opacity: dressing * drop,
          transform: `translateX(${interpolate(drop, [0, 1], [-24, 0])}px)`,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: accent,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 900,
            fontSize: 26,
          }}
        >
          {SIDE.charAt(0)}
        </div>
        <div style={{ color: "#fff", textShadow: "0 2px 6px rgba(0,0,0,.7)" }}>
          <div style={{ fontWeight: 900, fontSize: 19, letterSpacing: 0.5 }}>{SIDE} TEAM</div>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.5, color: "#f2c14e", marginTop: 2 }}>RECRUITING</div>
        </div>
      </div>

      {/* lower third: who, the headline, the commissions counter, the site */}
      <div
        style={{
          position: "absolute",
          left: SAFE.left,
          right: SAFE.right,
          bottom: SAFE.bottom,
          opacity: shown ? dressing * rise : 0,
          transform: `translateY(${interpolate(rise, [0, 1], [50, 0])}px)`,
        }}
      >
        <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, opacity: 0.9, marginBottom: 6, textShadow: "0 2px 6px rgba(0,0,0,.7)" }}>
          {props.reporterName} · ON {SIDE}
        </div>
        <div style={{ color: "#fff", fontSize: 34, fontWeight: 900, lineHeight: 1.08, textShadow: "0 3px 10px rgba(0,0,0,.7)", marginBottom: 14 }}>
          {props.headline}
        </div>

        <div
          style={{
            background: "rgba(10,15,30,.72)",
            border: `2px solid ${accent}`,
            borderRadius: 12,
            padding: "10px 14px 12px",
            marginBottom: 14,
            boxShadow: "0 6px 18px rgba(0,0,0,.4)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", color: "#fff" }}>
            <span style={{ fontSize: 12, letterSpacing: 2.5, fontWeight: 800, opacity: 0.85 }}>FOUNDING OFFICER SPOTS</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, color: "#fff", marginTop: 4 }}>
            <span style={{ fontSize: 44, fontWeight: 900, lineHeight: 1, color: left === 0 ? "#ff8f8f" : "#fff" }}>{left === 0 ? "FULL" : shownLeft}</span>
            {left > 0 && <span style={{ fontSize: 16, fontWeight: 800, opacity: 0.85 }}>OF {open} STILL OPEN</span>}
          </div>
          <div style={{ height: 10, borderRadius: 5, overflow: "hidden", background: "rgba(255,255,255,.18)", marginTop: 8 }}>
            <div style={{ width: `${open ? (shownLeft / open) * 100 : 0}%`, height: "100%", background: accent }} />
          </div>
        </div>

        <div
          style={{
            display: "inline-block",
            background: "#f2c14e",
            color: "#0a0f1e",
            fontWeight: 900,
            fontSize: 20,
            padding: "11px 16px",
            borderRadius: 10,
            boxShadow: "0 6px 18px rgba(0,0,0,.5)",
          }}
        >
          ▶ {props.url}
        </div>
      </div>

      {inOutro && (
        <>
          <AbsoluteFill style={{ background: "rgba(0,0,0,.62)", opacity: outro }} />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: SAFE.right,
              top: "44%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              opacity: outro,
              transform: `translateY(${interpolate(outro, [0, 1], [40, 0])}px) scale(${interpolate(outro, [0, 1], [0.92, 1])})`,
            }}
          >
            <span style={{ fontSize: 40, fontWeight: 900, letterSpacing: 4, color: accent, textShadow: "0 3px 12px rgba(0,0,0,.9)" }}>JOIN {SIDE}</span>
            <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2, color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,.9)" }}>
              {left === 0 ? "COMMISSIONS FULL · POSITIONS OPEN" : `${left} OFFICER COMMISSIONS OPEN`}
            </span>
            <span
              style={{
                fontSize: 40,
                fontWeight: 900,
                color: "#0a0f1e",
                background: "#f2c14e",
                padding: "12px 24px",
                borderRadius: 14,
                boxShadow: "0 10px 30px rgba(0,0,0,.5)",
              }}
            >
              {props.url}
            </span>
          </div>
        </>
      )}
      {props.safeGuide && <SafeGuide />}
    </AbsoluteFill>
  );
};

export const SocialClip = (props: SocialClipProps) => {
  if (props.variant === "plain") return <PlainClip {...props} />;
  return <ClipWithBed {...props} />;
};

const Bed = (props: SocialClipProps) => (props.bedSrc ? <Audio src={staticFile(props.bedSrc)} volume={props.bedVolume ?? 0.16} /> : null);

const ClipWithBed = (props: SocialClipProps) => {
  if (props.variant === "recruiter") return <RecruiterClip {...props} />;
  const frame = useCurrentFrame();
  const { fps, height, durationInFrames } = useVideoConfig();
  const letter = props.network.charAt(0);
  const rise = spring({ frame: frame - 8, fps, config: { damping: 200 } });
  const y = interpolate(rise, [0, 1], [60, 0]);
  const blink = Math.floor(frame / 15) % 2 === 0;
  // The closing card: after the last word the news dressing fades, the picture
  // dims, and JOIN THE BATTLE + the site step forward in the team's color.
  const outroStart = Math.max(0, durationInFrames - Math.round(2.0 * fps));
  const outro = spring({ frame: frame - outroStart, fps, config: { damping: 18, stiffness: 120 } });
  const inOutro = frame >= outroStart;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily: "Arial, Helvetica, sans-serif" }}>
      <Bed {...props} />
      <OffthreadVideo
        src={staticFile(props.anchorSrc)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <Scrim />

      {/* top: network bug + LIVE — just under the feed's top band */}
      <div
        style={{
          position: "absolute",
          top: SAFE.top,
          left: SAFE.left,
          right: SAFE.left,
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

      {/* score variant: big module under the bug */}
      {props.variant === "score" && (
        <div style={{ position: "absolute", top: SAFE.top + 80, left: SAFE.left, right: SAFE.left }}>
          <div style={{ color: "#fff", fontSize: 13, letterSpacing: 3, fontWeight: 700, marginBottom: 8, textAlign: "center", opacity: 0.85 }}>
            TERRITORY CONTROL
          </div>
          <Score red={props.redPct} blue={props.bluePct} big />
        </div>
      )}

      {/* lower-third stack: headline + score + CTA — above the caption band,
          left of the rail */}
      <div
        style={{
          position: "absolute",
          left: SAFE.left,
          right: SAFE.right,
          bottom: SAFE.bottom,
          transform: `translateY(${y}px)`,
          opacity: inOutro ? 1 - outro : 1,
        }}
      >
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

      {inOutro && (
        <>
          <AbsoluteFill style={{ background: "rgba(0,0,0,.62)", opacity: outro }} />
          <div
            style={{
              position: "absolute",
              left: 0,
              right: SAFE.right,
              top: "44%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              opacity: outro,
              transform: `translateY(${interpolate(outro, [0, 1], [40, 0])}px) scale(${interpolate(outro, [0, 1], [0.92, 1])})`,
            }}
          >
            <span style={{ fontSize: 40, fontWeight: 900, letterSpacing: 4, color: props.accent, textShadow: "0 3px 12px rgba(0,0,0,.9)" }}>JOIN THE BATTLE</span>
            <span
              style={{
                fontSize: 40,
                fontWeight: 900,
                color: "#0a0f1e",
                background: "#f2c14e",
                padding: "12px 24px",
                borderRadius: 14,
                boxShadow: "0 10px 30px rgba(0,0,0,.5)",
              }}
            >
              {props.url}
            </span>
          </div>
        </>
      )}
      {props.safeGuide && <SafeGuide />}
    </AbsoluteFill>
  );
};
