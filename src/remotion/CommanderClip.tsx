import { AbsoluteFill, Audio, Img, OffthreadVideo, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { CELLS, SIZE, TREE, WALL, WATER, TROOP_NAME, armyKinds, deployable, ownable, reach, simulate, trail, type Layout, type Placement, type Troop } from "../lib/commander/engine";
import { Ripple, TreeSprite, TroopIcon, Tuft, WALL_BRICK, hasTuft } from "../components/commander/icons";
import { BODY_FONT, HEAD_FONT } from "./fonts";

// Free social clips for Commander (vertical, no HeyGen), built from a real day's
// puzzle with the real engine:
//  - "nextmove": "Where would you place the next Archer?" — yesterday's map,
//    three lettered options, a countdown, then the answer.
//  - "hard": "I can't believe how hard this is" — a weak run on today's map
//    and a results card (e.g. 14 / 35). Never shows today's best layout.
//  - "tutorial": the how-to-play video, framed for phones.
//  - "hype": no info, just a push — two or three big lines ("NEW GAME" /
//    "JUST LAUNCHED" / "PLAY") over a past day's best run playing itself.
//  - "chain": a cliffhanger series — answers the last chain clip's question
//    (if there was one), asks a new one, then "answer in the next video".

export type CommanderClipProps = {
  variant: "nextmove" | "hard" | "tutorial" | "hype" | "chain";
  day: number;
  dayLabel: string; // "Friday · Hard"
  layout: Layout | null;
  solution: Placement[];
  optimal: number;
  seconds: number;
  audioSrc?: string | null;
  audioVolume?: number;
  lines?: string[]; // hype: the big lines, shown one after another
  answer?: { day: number; layout: Layout; solution: Placement[]; optimal: number } | null; // chain: the last question
};

export const DEFAULT_COMMANDER_CLIP: CommanderClipProps = { variant: "tutorial", day: 1, dayLabel: "", layout: null, solution: [], optimal: 0, seconds: 58 };

const FPS = 30;
const ME = "#356fd0";
const ENEMY = "#d23b3b";
const GOLD = "#f2c14e";
const FONT = HEAD_FONT;
const BODY = BODY_FONT;
const s = (sec: number) => Math.round(sec * FPS);
const phase = (frame: number, i: number, period: number): "a" | "b" =>
  Math.floor((frame / FPS + ((i * 37) % 23) / 10) / (period / 2)) % 2 === 0 ? "a" : "b";
const chevron: Record<string, string> = {
  l: "18,50 46,24 46,36 32,50 46,64 46,76",
  r: "82,50 54,24 54,36 68,50 54,64 54,76",
  u: "50,18 76,46 64,46 50,32 36,46 24,46",
  d: "50,82 76,54 64,54 50,68 36,54 24,54",
  ul: "50,18 76,46 64,46 50,32 36,46 24,46",
  ur: "50,18 76,46 64,46 50,32 36,46 24,46",
  dl: "50,18 76,46 64,46 50,32 36,46 24,46",
  dr: "50,18 76,46 64,46 50,32 36,46 24,46",
};
const turn: Record<string, number> = { ul: -45, ur: 45, dl: -135, dr: 135 };

/** When each placement lands and how its squares flip (square by square along its reach). */
function timeline(L: Layout, moves: Placement[], at: number[], step = 5) {
  const flipAt = new Array<number>(CELLS).fill(Infinity);
  for (const t of reach(L, L.commander, "commander")) flipAt[t] = -1;
  const marks = new Map<number, { at: number; dir: string }[]>();
  moves.forEach((p, k) => {
    const t0 = at[k] + 6;
    flipAt[p.i] = Math.min(flipAt[p.i], t0);
    const [x0, y0] = [p.i % SIZE, Math.floor(p.i / SIZE)];
    for (const { t, dir } of trail(L, p.i, p.kind)) {
      const d = Math.abs((t % SIZE) - x0) + Math.abs(Math.floor(t / SIZE) - y0);
      if (flipAt[t] === Infinity) flipAt[t] = t0 + d * step;
      marks.set(t, [...(marks.get(t) ?? []), { at: t0 + d * step, dir }]);
    }
  });
  return { flipAt, marks };
}

function Board({
  L,
  moves,
  at,
  frame,
  size = 1000,
  options,
}: {
  L: Layout;
  moves: Placement[];
  at: number[];
  frame: number;
  size?: number;
  options?: { i: number; label: string; correct: boolean; revealAt: number }[];
}) {
  const { fps } = useVideoConfig();
  const { flipAt, marks } = timeline(L, moves, at);
  const placed = new Map<number, { kind: Placement["kind"]; at: number }>();
  placed.set(L.commander, { kind: "commander", at: -999 });
  moves.forEach((p, k) => frame >= at[k] && placed.set(p.i, { kind: p.kind, at: at[k] }));
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "grid",
        gridTemplateColumns: `repeat(${SIZE}, 1fr)`,
        gap: 4,
        padding: 4,
        background: "#0e3f22",
        border: "8px solid #0c3c21",
        boxSizing: "border-box",
        position: "relative",
      }}
    >
      {Array.from({ length: CELLS }, (_, i) => {
        const t = L.terrain[i];
        const mine = frame >= flipAt[i];
        const pop = mine && flipAt[i] >= 0 ? interpolate(frame - flipAt[i], [0, 4, 9], [1.18, 1.06, 1], { extrapolateRight: "clamp" }) : 1;
        const troop = placed.get(i);
        const drop = troop ? (troop.at < 0 ? 1 : spring({ frame: frame - troop.at, fps, config: { damping: 11, stiffness: 160 } })) : 0;
        const mark = (marks.get(i) ?? []).filter((m) => frame >= m.at).pop()?.dir;
        const opt = options?.find((o) => o.i === i);
        const bg = t === WALL ? `${WALL_BRICK} 0 0 / 100% 100%, #70757d` : t === WATER ? "#2aa198" : mine ? ME : ENEMY;
        return (
          <div key={i} style={{ position: "relative", background: bg, transform: `scale(${pop})`, boxShadow: "inset -5px -5px 0 rgba(0,0,0,0.22), inset 5px 5px 0 rgba(255,255,255,0.12)" }}>
            {t === TREE && <TreeSprite frame={phase(frame, i, 2)} style={{ position: "absolute", inset: "8%", width: "84%", height: "84%" }} />}
            {t === WATER && <Ripple frame={phase(frame, i, 1.8)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", fill: "rgba(255,255,255,0.5)" }} />}
            {t !== TREE && ownable(L, i) && !troop && !opt && hasTuft(i) && (
              <Tuft frame={phase(frame, i, 1.6)} style={{ position: "absolute", left: "12%", bottom: "10%", width: "40%", height: "24%", fill: `rgba(255,255,255,${mine ? 0.4 : 0.34})` }} />
            )}
            {mine && !troop && mark && ownable(L, i) && (
              <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: "22%", width: "56%", height: "56%" }}>
                <polygon points={chevron[mark]} fill="rgba(255,255,255,0.6)" transform={turn[mark] ? `rotate(${turn[mark]} 50 50)` : undefined} />
              </svg>
            )}
            {opt && !troop && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "grid",
                  placeItems: "center",
                  background: frame >= opt.revealAt ? (opt.correct ? "rgba(242,193,78,0.85)" : "rgba(0,0,0,0.45)") : "rgba(255,255,255,0.22)",
                  outline: `5px solid ${frame >= opt.revealAt && opt.correct ? "#fff" : GOLD}`,
                  outlineOffset: -5,
                  fontFamily: FONT,
                  fontSize: size / SIZE / 1.8,
                  color: frame >= opt.revealAt && !opt.correct ? "rgba(255,255,255,0.4)" : "#14331d",
                }}
              >
                {opt.label}
              </div>
            )}
            {troop && (
              <div
                style={{
                  position: "absolute",
                  inset: "7%",
                  background: "#f6efdb",
                  border: "5px solid #264f9c",
                  color: ME,
                  transform: `scale(${drop}) translateY(${(1 - drop) * -30 + (phase(frame, i, 1.2) === "b" ? -3 : 0)}px)`,
                  boxShadow: "0 4px 0 rgba(0,0,0,0.35)",
                }}
              >
                <TroopIcon kind={troop.kind} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Footer({ frame, from }: { frame: number; from: number }) {
  return (
    // TikTok/Reels/Shorts cover the bottom ~25% (caption, sound, promote button)
    // and a strip down the right (like/comment buttons): keep the end card in
    // the middle of the frame, a little left of center.
    <div style={{ position: "absolute", top: 640, left: 50, right: 150, textAlign: "center", opacity: interpolate(frame, [from, from + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
      {/* the brand is CommanderBG; Commander is the puzzle mode */}
      <div style={{ fontFamily: FONT, fontSize: 112, letterSpacing: 2, color: GOLD, textShadow: "0 6px 0 rgba(0,0,0,0.35)" }}>CommanderBG</div>
      <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 40, marginTop: 10 }}>a daily strategy puzzle · play free</div>
      <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 44, marginTop: 14, color: "#fff" }}>CommanderBG.com</div>
    </div>
  );
}

/** The next-move quiz: a point in the best layout, the real next move, and two tempting decoys. */
function quiz(L: Layout, solution: Placement[]) {
  // the last Archer (or Scout) in the best layout that has some ground behind it (else any later move)
  let k = -1;
  for (let j = solution.length - 1; j >= 1; j--) if (solution[j].kind === "archer") { k = j; break; }
  if (k < 0) for (let j = solution.length - 1; j >= 1; j--) if (solution[j].kind === "scout") { k = j; break; }
  if (k < 0) k = Math.max(1, solution.length - 1);
  const before = solution.slice(0, k);
  const next = solution[k];
  const fin = simulate(L, before).final;
  const gain = (i: number) => reach(L, i, next.kind).filter((t) => !fin[t]).length;
  const decoys = [...deployable(L, fin, before, next.kind)]
    .filter((i) => i !== next.i && gain(i) > 0)
    .sort((a, b) => gain(b) - gain(a) || a - b)
    .slice(0, 2);
  const picks = [next.i, ...decoys];
  // shuffle deterministically so the answer isn't always A
  const order = picks.map((i, n) => ({ i, n, key: (i * 2654435761 + n) % 97 })).sort((a, b) => a.key - b.key);
  const letters = ["A", "B", "C"];
  return { before, next, options: order.map((o, n) => ({ i: o.i, label: letters[n], correct: o.i === next.i })), gainNext: gain(next.i) };
}

/** A weak but honest run: each troop where it takes the least new ground. */
function weakRun(L: Layout): Placement[] {
  const pl: Placement[] = [];
  const left: Record<Troop, number> = { archer: L.troops.archer, soldier: L.troops.soldier, scout: L.troops.scout ?? 0 };
  for (;;) {
    const fin = simulate(L, pl).final;
    let pick: Placement | null = null;
    let least = Infinity;
    for (const kind of armyKinds(L)) {
      if (left[kind] <= 0) continue;
      for (const i of deployable(L, fin, pl, kind)) {
        const g = reach(L, i, kind).filter((t) => !fin[t]).length;
        if (g > 0 && g < least) {
          least = g;
          pick = { i, kind };
        }
      }
    }
    if (!pick) break;
    pl.push(pick);
    left[pick.kind as Troop]--;
  }
  return pl;
}

export const CommanderClip = (p: CommanderClipProps) => {
  const frame = useCurrentFrame();
  const bed = p.audioSrc ? <Audio src={staticFile(p.audioSrc)} volume={p.audioVolume ?? 0.5} /> : null;
  const bg = "radial-gradient(120% 90% at 50% 30%, #17663a 0%, #0a2e1a 100%)";

  if (p.variant === "tutorial" || !p.layout) {
    return (
      <AbsoluteFill style={{ background: bg, color: "#f6efdb", fontFamily: BODY }}>
        {bed}
        <div style={{ position: "absolute", top: 110, width: "100%", textAlign: "center" }}>
          <div style={{ fontFamily: FONT, fontSize: 50, color: GOLD, letterSpacing: 4 }}>HOW TO PLAY</div>
          <Img src={staticFile("commander-logo-blue.png")} style={{ width: 860, height: "auto", display: "block", margin: "14px auto 0" }} />
          <div style={{ fontWeight: 700, fontSize: 42, marginTop: 22 }}>a daily strategy puzzle</div>
        </div>
        <div style={{ position: "absolute", top: 500, left: 30, width: 1020, height: 1020, border: "8px solid #0c3c21", boxSizing: "border-box" }}>
          <OffthreadVideo src={staticFile("commander-demo.mp4")} muted style={{ width: "100%", height: "100%" }} />
        </div>
        <div style={{ position: "absolute", bottom: 150, width: "100%", textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 44 }}>A new map every day — the same for everyone.</div>
          <div style={{ fontWeight: 700, fontSize: 48, marginTop: 16, color: "#fff" }}>CommanderBG.com</div>
        </div>
      </AbsoluteFill>
    );
  }

  const L = p.layout;
  const title = (text: string, sub?: string) => {
    const k = spring({ frame, fps: FPS, config: { damping: 14, stiffness: 140 } });
    return (
      <div style={{ position: "absolute", top: 140, left: 60, right: 60, textAlign: "center", transform: `scale(${k})` }}>
        <div style={{ fontFamily: FONT, fontSize: 84, lineHeight: 1.08 }}>{text}</div>
        {sub && <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 40, color: GOLD, marginTop: 18 }}>{sub}</div>}
      </div>
    );
  };

  if (p.variant === "hype") {
    const lines = p.lines?.length ? p.lines : ["NEW GAME", "JUST LAUNCHED", "PLAY"];
    const per = s(2.1);
    const endAt = lines.length * per + s(0.6);
    const run = p.solution;
    const at = run.map((_, k) => s(0.4) + k * 14);
    const cur = Math.min(lines.length - 1, Math.floor(frame / per));
    const k = spring({ frame: frame - cur * per, fps: FPS, config: { damping: 10, stiffness: 170 } });
    return (
      <AbsoluteFill style={{ background: bg, color: "#f6efdb" }}>
        {bed}
        <div style={{ position: "absolute", top: 460, left: 40, opacity: 0.55 }}>
          <Board L={L} moves={run} at={at} frame={frame} />
        </div>
        {frame < endAt && (
          <AbsoluteFill style={{ display: "grid", placeItems: "center", padding: "0 70px" }}>
            <div style={{ transform: `scale(${k})`, textAlign: "center", fontFamily: FONT, fontSize: lines[cur].length > 14 ? 120 : 170, lineHeight: 1.05, color: cur === lines.length - 1 ? GOLD : "#fff", textShadow: "0 10px 0 rgba(0,0,0,0.45), 0 0 40px rgba(0,0,0,0.5)" }}>
              {lines[cur]}
            </div>
          </AbsoluteFill>
        )}
        {frame >= endAt && <AbsoluteFill style={{ background: "rgba(10,46,26,0.96)", opacity: interpolate(frame, [endAt, endAt + s(0.4)], [0, 1]) }}><Footer frame={frame} from={endAt} /></AbsoluteFill>}
      </AbsoluteFill>
    );
  }

  if (p.variant === "chain") {
    // part 1 (optional): the answer to the last clip's question
    const A = p.answer ?? null;
    const aq = A ? quiz(A.layout, A.solution) : null;
    const A_END = aq ? s(6) : 0;
    const A_REVEAL = s(1.8);
    // part 2: the new question, no answer — that's the next video
    const q = quiz(L, p.solution);
    const Kind = TROOP_NAME[q.next.kind as Troop];
    const f2 = frame - A_END;
    const Q_END = A_END + s(8.5);
    const count = f2 >= s(3.2) && f2 < s(6.5) ? 3 - Math.floor((f2 - s(3.2)) / s(1.1)) : null;
    const t2 = spring({ frame: f2, fps: FPS, config: { damping: 14, stiffness: 140 } });
    if (aq && A && frame < A_END) {
      const ans = aq.options.find((o) => o.correct)!.label;
      const t1 = spring({ frame, fps: FPS, config: { damping: 14, stiffness: 140 } });
      return (
        <AbsoluteFill style={{ background: bg, color: "#f6efdb" }}>
          {bed}
          <div style={{ position: "absolute", top: 140, left: 60, right: 60, textAlign: "center", transform: `scale(${t1})` }}>
            <div style={{ fontFamily: FONT, fontSize: 84, lineHeight: 1.08 }}>Last video&apos;s answer…</div>
            <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 40, color: GOLD, marginTop: 18 }}>CommanderBG #{A.day}</div>
          </div>
          <div style={{ position: "absolute", top: 520, left: 40 }}>
            <Board L={A.layout} moves={[...aq.before, aq.next]} at={[...aq.before.map(() => -1), A_REVEAL]} frame={frame} options={aq.options.map((o) => ({ ...o, revealAt: A_REVEAL }))} />
          </div>
          {frame >= A_REVEAL + 6 && (
            <div style={{ position: "absolute", top: 1550, left: 60, right: 60, textAlign: "center", fontFamily: BODY, fontWeight: 700, fontSize: 50, lineHeight: 1.2 }}>
              <span style={{ fontFamily: FONT, color: GOLD, fontSize: 90 }}>{ans}!</span> It takes {aq.gainNext} more squares.
            </div>
          )}
        </AbsoluteFill>
      );
    }
    return (
      <AbsoluteFill style={{ background: bg, color: "#f6efdb" }}>
        {bed}
        <div style={{ position: "absolute", top: 140, left: 60, right: 60, textAlign: "center", transform: `scale(${t2})` }}>
          <div style={{ fontFamily: FONT, fontSize: 84, lineHeight: 1.08 }}>{aq ? "Next question:" : "Quick question:"} where does the next {Kind} go?</div>
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 40, color: GOLD, marginTop: 18 }}>CommanderBG #{p.day} · {p.dayLabel}</div>
        </div>
        <div style={{ position: "absolute", top: 560, left: 40 }}>
          <Board L={L} moves={q.before} at={q.before.map(() => -1)} frame={f2} options={f2 >= s(1) ? q.options.map((o) => ({ ...o, revealAt: Infinity })) : undefined} />
        </div>
        {count !== null && count > 0 && (
          <div style={{ position: "absolute", top: 1600, width: "100%", textAlign: "center", fontFamily: FONT, fontSize: 130, color: GOLD }}>{count}</div>
        )}
        {f2 >= s(1) && f2 < s(3.2) && (
          <div style={{ position: "absolute", top: 1610, width: "100%", textAlign: "center", fontFamily: BODY, fontWeight: 700, fontSize: 50 }}>A, B or C? Comment it 👇</div>
        )}
        {f2 >= s(6.5) && frame < Q_END && (
          <AbsoluteFill style={{ display: "grid", placeItems: "center", background: "rgba(10,46,26,0.82)" }}>
            <div style={{ textAlign: "center", transform: `scale(${spring({ frame: f2 - s(6.5), fps: FPS, config: { damping: 10, stiffness: 170 } })})` }}>
              <div style={{ fontFamily: FONT, fontSize: 110, lineHeight: 1.1, color: GOLD }}>Answer in the next video 👀</div>
              <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 52, marginTop: 30 }}>Follow so you don&apos;t miss it</div>
            </div>
          </AbsoluteFill>
        )}
        {frame >= Q_END && <AbsoluteFill style={{ background: "rgba(10,46,26,0.96)", opacity: interpolate(frame, [Q_END, Q_END + s(0.4)], [0, 1]) }}><Footer frame={frame} from={Q_END} /></AbsoluteFill>}
      </AbsoluteFill>
    );
  }

  if (p.variant === "nextmove") {
    const q = quiz(L, p.solution);
    const Kind = TROOP_NAME[q.next.kind as Troop];
    const T_REVEAL = s(9.4);
    const at = [...q.before.map(() => -1), T_REVEAL];
    const moves = [...q.before, q.next];
    const count = frame >= s(6) && frame < T_REVEAL ? 3 - Math.floor((frame - s(6)) / s(1.1)) : null;
    const answer = q.options.find((o) => o.correct)!.label;
    return (
      <AbsoluteFill style={{ background: bg, color: "#f6efdb" }}>
        {bed}
        {title(`Where would you place the next ${Kind}?`, `Yesterday's CommanderBG #${p.day} · ${p.dayLabel}`)}
        <div style={{ position: "absolute", top: 520, left: 40 }}>
          <Board L={L} moves={moves} at={at} frame={frame} options={frame >= s(1.8) ? q.options.map((o) => ({ ...o, revealAt: T_REVEAL })) : undefined} />
        </div>
        {count !== null && count > 0 && (
          <div style={{ position: "absolute", top: 1560, width: "100%", textAlign: "center", fontFamily: FONT, fontSize: 130, color: GOLD }}>{count}</div>
        )}
        {frame >= T_REVEAL + 6 && frame < s(11.6) && (
          <div style={{ position: "absolute", top: 1550, left: 60, right: 60, textAlign: "center", fontFamily: BODY, fontWeight: 700, fontSize: 50, lineHeight: 1.2 }}>
            <span style={{ fontFamily: FONT, color: GOLD, fontSize: 70 }}>{answer}!</span> It takes {q.gainNext} more squares — and sets up the perfect {p.optimal}.
          </div>
        )}
        {frame < T_REVEAL && frame >= s(1.8) && (
          <div style={{ position: "absolute", top: 1570, width: "100%", textAlign: "center", fontFamily: BODY, fontWeight: 700, fontSize: 46, opacity: count ? 0 : 1 }}>
            A, B or C? Answer in the comments.
          </div>
        )}
        {frame >= s(11.6) && <AbsoluteFill style={{ background: "rgba(10,46,26,0.96)", opacity: interpolate(frame, [s(11.6), s(12)], [0, 1]) }}><Footer frame={frame} from={s(11.6)} /></AbsoluteFill>}
      </AbsoluteFill>
    );
  }

  // "hard": a weak run, then the results card
  const run = weakRun(L);
  const step = 16;
  const at = run.map((_, k) => s(1.6) + k * step);
  const doneAt = (at[at.length - 1] ?? s(1.6)) + s(1.2);
  const score = simulate(L, run).score;
  const card = spring({ frame: frame - doneAt, fps: FPS, config: { damping: 12, stiffness: 150 } });
  return (
    <AbsoluteFill style={{ background: bg, color: "#f6efdb" }}>
      {bed}
      {title("I can't believe how hard this is", `CommanderBG #${p.day} · ${p.dayLabel}`)}
      <div style={{ position: "absolute", top: 480, left: 40 }}>
        <Board L={L} moves={run} at={at} frame={frame} />
      </div>
      {frame >= doneAt && (
        <AbsoluteFill style={{ display: "grid", placeItems: "center", background: `rgba(10,46,26,${0.7 * Math.min(1, card)})` }}>
          <div style={{ transform: `scale(${card})`, width: 800, background: "#124f2b", border: `10px solid ${GOLD}`, padding: "50px 40px", textAlign: "center", fontFamily: BODY, fontWeight: 700 }}>
            <div style={{ fontSize: 40, letterSpacing: 4, color: GOLD }}>MY SCORE</div>
            <div style={{ fontFamily: FONT, fontSize: 220, lineHeight: 1 }}>{score}</div>
            <div style={{ fontSize: 56, marginTop: 10 }}>out of {p.optimal}</div>
            <div style={{ fontSize: 46, marginTop: 34, color: GOLD }}>Can you beat me?</div>
          </div>
        </AbsoluteFill>
      )}
      {frame >= doneAt + s(3.2) && <AbsoluteFill style={{ background: "rgba(10,46,26,0.96)", opacity: interpolate(frame, [doneAt + s(3.2), doneAt + s(3.6)], [0, 1]) }}><Footer frame={frame} from={doneAt + s(3.2)} /></AbsoluteFill>}
    </AbsoluteFill>
  );
};

/** How long a variant runs (the producer passes it back in as `seconds`). */
export function commanderClipSeconds(p: Pick<CommanderClipProps, "variant" | "layout">): number {
  if (p.variant === "tutorial" || !p.layout) return 58;
  if (p.variant === "nextmove") return 15;
  if (p.variant === "hype") return 0; // the producer sets it from the line count
  if (p.variant === "chain") return 0; // the producer sets it (with or without the answer part)
  const n = weakRun(p.layout).length;
  return Math.ceil(1.6 + (n * 16) / FPS + 1.2 + 3.2 + 3);
}
