"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CELLS,
  DIFFICULTY,
  DIFFICULTY_NAME,
  KINDS,
  SIZE,
  TREE,
  WALL,
  WATER,
  WEEKDAY,
  deployable,
  ownable,
  prune,
  reach,
  simulate,
  type Kind,
  type Layout,
  type Placement,
} from "@/lib/commander/engine";
import { LoginOtp } from "@/components/login-otp";
import { track } from "@/lib/track";
import { TroopIcon } from "./icons";

type Side = "red" | "blue";
type Result = {
  score: number;
  medal: string | null;
  reward: string | null;
  placements: Placement[];
  optimal: number;
  solution: Placement[];
  thresholds: { bronze: number; silver: number; gold: number; perfect: number };
  histogram: { score: number; players: number }[];
};
type DayResponse = { day: number; layout: Layout; side: Side | null; signedIn: boolean; isAdmin?: boolean; result: Result | null };

const NAME: Record<Kind, string> = { commander: "Commander", archer: "Archer", soldier: "Soldier" };
const BLURB: Record<Kind, string> = {
  commander: "goes first, anywhere · takes the 3×3",
  archer: "3 left + 3 right · over walls & water, trees stop it",
  soldier: "2 up + 2 down · through trees, walls & water stop it",
};
const MEDAL: Record<string, string> = { perfect: "💎 PERFECT!", gold: "🥇 GOLD", silver: "🥈 SILVER", bronze: "🥉 BRONZE" };
const PENDING = "bg_commander_pending";
const GUEST_SIDE = "bg_commander_side";
const DRAFT = "bg_commander_draft";

function storedSide(): Side | null {
  try {
    const g = localStorage.getItem(GUEST_SIDE);
    return g === "red" || g === "blue" ? g : null;
  } catch {
    return null;
  }
}

export function CommanderGame() {
  const [data, setData] = useState<DayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guestSide, setGuestSide] = useState<Side | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selected, setSelected] = useState<Kind>("commander");
  const [focus, setFocus] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [showOptimal, setShowOptimal] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [posting, setPosting] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    try {
      const r = await fetch("/api/commander/day", { cache: "no-store" });
      const d = (await r.json()) as DayResponse;
      try {
        const g = localStorage.getItem(GUEST_SIDE);
        if (g === "red" || g === "blue") setGuestSide(g);
      } catch {
        /* ignore */
      }
      setData(d);
      if (d.result) {
        setResult(d.result);
        setPlacements(d.result.placements);
      } else {
        // a score saved before signing in posts itself now
        const pending = readPending();
        if (pending && pending.day === d.day) {
          setPlacements(pending.placements);
          if (d.signedIn && (d.side || d.isAdmin)) void submit(d, pending.placements);
        } else {
          try {
            const draft = JSON.parse(localStorage.getItem(DRAFT) ?? "null");
            if (draft?.day === d.day) setPlacements(draft.placements);
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      setError("Couldn't load today's battle. Refresh to try again.");
    }
  }

  useEffect(() => {
    track("commander_open");
    // load() only sets state after its fetch resolves
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const side: Side | null = data?.side ?? guestSide;
  const L = data?.layout ?? null;
  const locked = !!result;
  const shown = showOptimal && result ? result.solution : placements;
  const sim = useMemo(() => (L ? simulate(L, shown) : null), [L, shown]);
  const left = useMemo(() => {
    const out: Record<Kind, number> = { commander: 0, archer: 0, soldier: 0 };
    if (!L) return out;
    for (const k of KINDS) out[k] = L.troops[k] - placements.filter((p) => p.kind === k).length;
    return out;
  }, [L, placements]);
  // the Commander always goes first; after that, the picked troop (or whatever's left)
  const nextKind: Kind | null =
    placements.length === 0 ? "commander" : left[selected] > 0 && selected !== "commander" ? selected : (["archer", "soldier"] as Kind[]).find((k) => left[k] > 0) ?? null;
  const zone = useMemo(
    () => (L && sim && !locked && nextKind ? deployable(L, sim.final, placements, nextKind) : new Set<number>()),
    [L, sim, locked, nextKind, placements],
  );
  const focusReach = useMemo(() => {
    if (!L || focus == null) return null;
    const p = shown.find((q) => q.i === focus);
    return p ? new Set(reach(L, p.i, p.kind)) : null;
  }, [L, focus, shown]);

  const total = L ? L.troops.soldier + L.troops.archer + L.troops.commander : 0;

  function place(next: Placement[]) {
    setPlacements(next);
    try {
      if (data) localStorage.setItem(DRAFT, JSON.stringify({ day: data.day, placements: next }));
    } catch {
      /* ignore */
    }
  }

  function tap(i: number) {
    if (locked || !L) return;
    const at = placements.findIndex((p) => p.i === i);
    if (at >= 0) {
      // picking a troop up also drops any later troop standing on ground it took
      place(prune(L, placements.filter((_, k) => k !== at)));
      if (placements[at].kind !== "commander") setSelected(placements[at].kind);
      return;
    }
    if (!nextKind || !zone.has(i)) return;
    const kind = nextKind;
    place([...placements, { i, kind }]);
    const remaining = { ...left, [kind]: left[kind] - 1 };
    if (kind === "commander" || remaining[kind] <= 0) {
      const next = (["archer", "soldier"] as Kind[]).find((k) => remaining[k] > 0);
      if (next) setSelected(next);
    }
  }

  function readPending(): { day: number; placements: Placement[] } | null {
    try {
      const raw = localStorage.getItem(PENDING);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async function submit(d: DayResponse | null = data, pl: Placement[] = placements) {
    if (!d) return;
    setConfirming(false);
    try {
      localStorage.setItem(PENDING, JSON.stringify({ day: d.day, placements: pl }));
    } catch {
      /* ignore */
    }
    if (!d.signedIn) {
      setNeedLogin(true);
      return;
    }
    if (!d.side && !d.isAdmin) {
      window.location.href = "/?ref=commander";
      return;
    }
    setPosting(true);
    try {
      const r = await fetch("/api/commander/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day: d.day, placements: pl, side: d.side ?? guestSide ?? storedSide() }),
      });
      const j = await r.json();
      if (!r.ok) {
        if (j.needsEnlist) window.location.href = "/?ref=commander";
        else setError(j.error ?? "Couldn't post your score.");
        if (r.status === 409) void load();
        return;
      }
      try {
        localStorage.removeItem(PENDING);
      } catch {
        /* ignore */
      }
      track("commander_submit", { score: j.score, medal: j.medal });
      setResult(j as Result);
      setShowResult(true);
    } finally {
      setPosting(false);
    }
  }

  function shareText() {
    if (!data || !result || !L || !side) return "";
    const me = side === "blue" ? "🟦" : "🟥";
    const them = side === "blue" ? "🟥" : "🟦";
    const fin = simulate(L, result.placements).final;
    const rows: string[] = [];
    for (let y = 0; y < SIZE; y++) {
      let row = "";
      for (let x = 0; x < SIZE; x++) {
        const i = y * SIZE + x;
        row += fin[i] ? me : L.terrain[i] === WALL ? "⬛" : L.terrain[i] === WATER ? "💧" : them;
      }
      rows.push(row);
    }
    const medal = result.medal ? MEDAL[result.medal].split(" ")[0] : "";
    return `Commander #${data.day} ${me} ${result.score}/${result.optimal} ${medal}\n${rows.join("\n")}\ndollarbattleground.com/commander`;
  }

  async function share() {
    const text = shareText();
    track("commander_share");
    try {
      if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* cancelled */
    }
  }

  if (error && !data) return <div className="cm-wrap"><p className="cm-note">{error}</p></div>;
  if (!data || !L || !sim) return <div className="cm-wrap"><p className="cm-note">Scouting today&apos;s battlefield…</p></div>;

  if (!side)
    return (
      <div className="cm-wrap">
        <Header day={data.day} />
        <div className="ob-overlay" role="dialog" aria-label="Choose your color">
          <div className="ob-card">
            <div className="ob-kicker">◆ COMMANDER #{data.day} ◆</div>
            <h2 className="ob-title">TODAY&apos;S BATTLE</h2>
            <p className="ob-body">Place your troops, take the most ground. A new map every day — same one for everyone. Which color are you?</p>
            <div className="cm-pick">
              {(["blue", "red"] as Side[]).map((s) => (
                <button
                  key={s}
                  className={"ob-btn cm-pick-" + s}
                  onClick={() => {
                    setGuestSide(s);
                    try {
                      localStorage.setItem(GUEST_SIDE, s);
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  {s === "blue" ? "BLUE" : "RED"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );

  const at = new Map(shown.map((p) => [p.i, p.kind]));
  const order = new Map(shown.map((p, k) => [p.i, k + 1]));

  return (
    <div className={"cm-wrap side-" + side}>
      <Header day={data.day} layout={L} />

      {showOptimal && result && (
        <div className="cm-banner">BEST LAYOUT · {result.optimal} squares · <button className="cm-link" onClick={() => setShowOptimal(false)}>show mine</button></div>
      )}

      <div className="cm-score" aria-live="polite">
        <span className="cm-score-n">{sim.score}</span>
        <span className="cm-score-l">squares taken</span>
      </div>

      <div className="cm-board" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }} onMouseLeave={() => setFocus(null)}>
        {Array.from({ length: CELLS }, (_, i) => {
          const t = L.terrain[i];
          const kind = at.get(i);
          const cls = [
            "cm-tile",
            t === WALL ? "wall" : t === WATER ? "water" : t === TREE ? "tree" : "",
            ownable(L, i) ? (sim.final[i] ? "you" : "enemy") : "",
            zone.has(i) && !locked && !kind ? "deploy" : "",
            focusReach?.has(i) ? "focus" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button
              key={i}
              type="button"
              className={cls}
              onClick={() => tap(i)}
              onMouseEnter={() => kind && setFocus(i)}
              aria-label={`tile ${i % SIZE},${Math.floor(i / SIZE)}${kind ? " " + kind : ""}`}
            >
              {t === TREE && <span className="cm-tree-mark" aria-hidden />}
              {kind && (
                <span className={"cm-troop " + side}>
                  <TroopIcon kind={kind} />
                  <span className="cm-plus">{order.get(i)}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!locked ? (
        <>
          <div className="cm-tray">
            {KINDS.map((k) => (
              <button key={k} className={"cm-troop-btn" + (nextKind === k ? " on" : "") + (left[k] <= 0 ? " empty" : "")} onClick={() => k !== "commander" && setSelected(k)}>
                <span className={"cm-troop " + side}><TroopIcon kind={k} /></span>
                <span className="cm-tb-name">{NAME[k]} ×{left[k]}</span>
                <span className="cm-tb-blurb">{BLURB[k]}</span>
              </button>
            ))}
          </div>
          <p className="cm-hint">
            {placements.length === 0
              ? "Start by placing your Commander anywhere on the map."
              : placements.length < total
                ? "Archers and Soldiers deploy on your ground (the glowing tiles). Order matters. Tap a troop to pick it back up."
                : "All troops deployed. Happy with it? You only get one shot."}
          </p>
          <button className="ob-btn cm-submit" disabled={placements.length === 0 || posting} onClick={() => setConfirming(true)}>
            {posting ? "POSTING…" : `ATTACK! (${placements.length}/${total} deployed)`}
          </button>
          {error && <p className="ct-error">{error}</p>}
        </>
      ) : (
        <div className="cm-after">
          <button className="ob-btn" onClick={() => setShowResult(true)}>SEE RESULTS</button>
          <button className="ob-skip" onClick={() => setShowOptimal((v) => !v)}>{showOptimal ? "show my layout" : "view best layout"}</button>
        </div>
      )}

      <details className="cm-how">
        <summary>How to play</summary>
        <ul>
          <li>The whole map starts as the enemy&apos;s. Turn as many squares to your color as you can.</li>
          <li><b>Commander</b> goes first, anywhere, and takes the 3×3 around it.</li>
          <li><b>Archers</b> and <b>Soldiers</b> can only stand on ground you hold — including ground you just took. Order matters.</li>
          <li><b>Archer</b> takes 3 squares left and 3 right. Arrows fly over walls and water; a tree stops them.</li>
          <li><b>Soldier</b> takes 2 squares up and 2 down. Soldiers march through trees (and take them); walls and water stop them.</li>
          <li>A new map every day, the same for everyone. Monday is the easiest, Friday and Saturday the hardest.</li>
          <li>One shot. Score 90% of the best possible for a free square on the main map; hit perfect for a 2×2.</li>
        </ul>
      </details>

      {confirming && (
        <div className="ob-overlay" role="dialog" aria-label="Confirm attack" onClick={() => setConfirming(false)}>
          <div className="ob-card" onClick={(e) => e.stopPropagation()}>
            <div className="ob-kicker">◆ ONE SHOT ◆</div>
            <h2 className="ob-title">ATTACK WITH {sim.score}?</h2>
            <p className="ob-body">
              {placements.length < total ? `You still have ${total - placements.length} troop${total - placements.length > 1 ? "s" : ""} in reserve. ` : ""}
              You get one submission a day.
            </p>
            <button className="ob-btn" onClick={() => submit()}>ATTACK →</button>
            <button className="ob-skip" onClick={() => setConfirming(false)}>‹ keep planning</button>
          </div>
        </div>
      )}

      {needLogin && (
        <div className="ob-overlay" role="dialog" aria-label="Post your score">
          <div className="ob-card">
            {loginOpen ? (
              <LoginOtp
                onBack={() => setLoginOpen(false)}
                onSignedIn={() => {
                  setLoginOpen(false);
                  setNeedLogin(false);
                  void load();
                }}
              />
            ) : (
              <>
                <div className="ob-kicker">◆ POST YOUR SCORE ◆</div>
                <h2 className="ob-title">{sim.score} POINTS</h2>
                <p className="ob-body">
                  Scores post under your name. New here? Enlist free on the main map — your first square is free — and your score posts
                  when you come back.
                </p>
                <Link className="ob-btn cm-linkbtn" href="/?ref=commander">ENLIST FREE →</Link>
                <button className="ob-skip" onClick={() => setLoginOpen(true)}>Already enlisted? Log in</button>
                <button className="ob-skip" onClick={() => setNeedLogin(false)}>‹ back to the battle</button>
              </>
            )}
          </div>
        </div>
      )}

      {showResult && result && (
        <ResultsModal
          day={data.day}
          result={result}
          copied={copied}
          onShare={share}
          onClose={() => setShowResult(false)}
          onOptimal={() => {
            setShowOptimal(true);
            setShowResult(false);
          }}
        />
      )}
    </div>
  );
}

function Header({ day, layout }: { day: number; layout?: Layout }) {
  return (
    <div className="cm-head">
      <Link href="/" className="cm-back">‹ main map</Link>
      <h1 className="cm-title">COMMANDER</h1>
      <div className="cm-day">
        #{day}
        {layout ? ` · ${WEEKDAY[layout.weekday].slice(0, 3).toUpperCase()} · ${DIFFICULTY_NAME[DIFFICULTY[layout.weekday]].toUpperCase()}` : ""}
      </div>
    </div>
  );
}

export function ResultsModal({
  day,
  result,
  copied,
  onShare,
  onClose,
  onOptimal,
}: {
  day: number;
  result: Result;
  copied: boolean;
  onShare: () => void;
  onClose: () => void;
  onOptimal: () => void;
}) {
  const t = result.thresholds;
  const lo = Math.min(t.bronze - 5, ...result.histogram.map((h) => h.score), result.score);
  const hi = result.optimal;
  const buckets = Array.from({ length: Math.max(1, hi - lo + 1) }, (_, k) => lo + k);
  const count = new Map(result.histogram.map((h) => [h.score, h.players]));
  const max = Math.max(1, ...result.histogram.map((h) => h.players));
  return (
    <div className="ob-overlay" role="dialog" aria-label="Results" onClick={onClose}>
      <div className="ob-card cm-results" onClick={(e) => e.stopPropagation()}>
        <button className="cm-x" onClick={onClose} aria-label="Close">×</button>
        <div className="ob-kicker">◆ RESULTS · DAY {day} ◆</div>
        <div className="cm-res-score">
          <div className="cm-res-l">YOUR SCORE</div>
          <div className="cm-res-n">{result.score}</div>
          <div className="cm-res-medal">{result.medal ? MEDAL[result.medal] : `${t.bronze - result.score} short of a medal`}</div>
        </div>
        <div className="cm-lines">🥉 {t.bronze}+ · 🥈 {t.silver}+ · 🥇 {t.gold}+ · 💎 {t.perfect}</div>
        <div className="cm-hist" aria-label="Score distribution">
          {buckets.map((s) => (
            <div key={s} className={"cm-bar" + (s === result.score ? " you" : "")} style={{ height: `${((count.get(s) ?? 0) / max) * 100}%` }}>
              {s === result.score && <span className="cm-you">You</span>}
            </div>
          ))}
        </div>
        {result.reward && <div className="cm-reward">+ a free {result.reward === "2x2" ? "2×2" : "1×1"} is waiting on the main map</div>}
        <div className="cm-res-btns">
          <button className="ob-btn" onClick={onShare}>{copied ? "COPIED!" : "SHARE"}</button>
          {result.score < result.optimal && <button className="ob-btn cm-dark" onClick={onOptimal}>VIEW BEST</button>}
        </div>
        <Link className="ob-skip" href="/">‹ back to the main map</Link>
      </div>
    </div>
  );
}
