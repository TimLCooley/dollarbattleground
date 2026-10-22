"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  CELLS,
  DIFFICULTY,
  DIFFICULTY_NAME,
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
  trail,
  armyKinds,
  countOf,
  type Kind,
  type Layout,
  type Troop,
  type Placement,
} from "@/lib/commander/engine";
import { LoginOtp } from "@/components/login-otp";
import { EnlistInline } from "./enlist-inline";
import { track } from "@/lib/track";
import { pixel } from "@/lib/pixel";
import { CommanderLogo } from "./logo";
import { Notches, Ripple, TreeSprite, TroopIcon, Tuft, hasTuft, sway, wallClass, type Art } from "./icons";
import { FallingLeaves } from "./falling-leaves";
import { Insignia } from "@/lib/ranks";
import { ENLISTED_RANKS, OFFICER_RANKS, PERFECT_BONUS, STREAK_DAYS, type CmdRank } from "@/lib/commander/rank";

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
type DayResponse = { day: number; today: number; layout: Layout; side: Side | null; signedIn: boolean; isAdmin?: boolean; result: Result | null; rank?: CmdRank | null; skin?: { id: string; me: string; them: string; art?: string } | null };

const NAME: Record<Troop, string> = { archer: "Archer", soldier: "Soldier", scout: "Scout" };
const BLURB: Record<Troop, string> = {
  archer: "3 left + 3 right · over walls & water, trees stop it",
  soldier: "2 up + 2 down · through trees, wades water, walls stop it",
  scout: "2 on each diagonal · hops water, walls & trees stop it",
};
// medal tiers read as stars; a perfect score takes the castle
const STARS: Record<string, string> = { perfect: "🏰", gold: "⭐⭐⭐", silver: "⭐⭐", bronze: "⭐" };
const MEDAL: Record<string, string> = { perfect: "🏰 CASTLE!", gold: "⭐⭐⭐ 3 STARS", silver: "⭐⭐ 2 STARS", bronze: "⭐ 1 STAR" };
const PENDING = "bg_commander_pending";
const GUEST_SIDE = "bg_commander_side";
const DRAFT = "bg_commander_draft";
const BEST = "bg_commander_best";
const DEMO_PREF = "bg_commander_demo"; // "off" = don't open the video on load

function storedSide(): Side | null {
  try {
    const g = localStorage.getItem(GUEST_SIDE);
    return g === "red" || g === "blue" ? g : null;
  } catch {
    return null;
  }
}

type FriendPath = { day: number; locked: boolean; mine?: boolean; score?: number; placements?: Placement[] };
type ShareMode = "score" | "path";

export function CommanderGame({ day: askedDay, unsubscribed = false, pathId }: { day?: number; unsubscribed?: boolean; pathId?: string } = {}) {
  const [data, setData] = useState<DayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guestSide, setGuestSide] = useState<Side | null>(null);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [picked, setSelected] = useState<Troop>("archer");
  const [best, setBest] = useState<{ score: number; placements: Placement[] } | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);
  const [rankOpen, setRankOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const enemyAlpha = useSyncExternalStore(subscribeSettings, readEnemyAlpha, () => ENEMY_ALPHA_DEFAULT);
  const [demoAuto, setDemoAuto] = useState(true);
  const [remindOpen, setRemindOpen] = useState(false);
  const [focus, setFocus] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [showOptimal, setShowOptimal] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [posting, setPosting] = useState(false);
  const [needLogin, setNeedLogin] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const [scoutSeen, setScoutSeen] = useState(() => {
    try {
      return typeof window === "undefined" || localStorage.getItem("bg_seen_scout") === "1";
    } catch {
      return true;
    }
  }); // "Already enlisted? Log in" — e.g. on a new computer
  const [loginOpen, setLoginOpen] = useState(false);
  const [enlistOpen, setEnlistOpen] = useState(false);
  const [copied, setCopied] = useState<ShareMode | null>(null);
  // "Share my path": a friend's layout from a ?p= link (locked until you've played that day)
  const [friend, setFriend] = useState<FriendPath | null>(null);
  const [showFriend, setShowFriend] = useState(false);
  const [myPathId, setMyPathId] = useState<string | null>(null);
  const [pathImg, setPathImg] = useState<File | null>(null); // the square board picture, fetched ahead so sharing stays instant

  async function load() {
    try {
      const r = await fetch(`/api/commander/day${askedDay ? `?day=${askedDay}` : ""}`, { cache: "no-store" });
      if (!r.ok) {
        // a future day (or a bad link) — back to today's map
        window.location.replace("/");
        return;
      }
      const d = (await r.json()) as DayResponse;
      // the how-to-play video opens when you arrive (once per visit, not on every
      // day you flip to) unless the player turned that off
      let auto = true;
      try {
        auto = localStorage.getItem(DEMO_PREF) !== "off" && !sessionStorage.getItem("bg_commander_demo_seen");
        sessionStorage.setItem("bg_commander_demo_seen", "1");
      } catch {
        /* ignore */
      }
      setDemoAuto(auto);
      setDemoOpen(auto);
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
            // saved layouts are re-checked against today's map (rules can change)
            if (draft?.day === d.day) setPlacements(prune(d.layout, draft.placements));
            const b = JSON.parse(localStorage.getItem(BEST) ?? "null");
            if (b?.day === d.day) {
              const pl = prune(d.layout, b.placements);
              if (pl.length) setBest({ score: simulate(d.layout, pl).score, placements: pl });
            }
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
    // where they came from (social links carry ?ref=) — the home page is Commander now
    const ref = new URLSearchParams(window.location.search).get("ref");
    track("commander_open", ref ? { ref } : undefined);
    // load() only sets state after its fetch resolves
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the admin isn't enlisted on the main map: no color prompt, plays Blue unless they picked otherwise
  const side: Side | null = data?.side ?? guestSide ?? (data?.isAdmin ? "blue" : null);
  const L = data?.layout ?? null;
  const locked = !!result;
  const shown =
    showOptimal && result ? result.solution : showFriend && result && friend?.placements ? friend.placements : placements;
  const sim = useMemo(() => (L ? simulate(L, shown) : null), [L, shown]);
  // today's two troop types (Archer + Soldier, or the Scout with one of them)
  const TROOPS: Troop[] = L ? armyKinds(L) : ["archer", "soldier"];
  const selected: Troop = TROOPS.includes(picked) ? picked : TROOPS[0];
  const left = useMemo(() => {
    const out: Record<Troop, number> = { archer: 0, soldier: 0, scout: 0 };
    if (!L) return out;
    for (const k of armyKinds(L)) out[k] = countOf(L, k) - placements.filter((p) => p.kind === k).length;
    return out;
  }, [L, placements]);
  // only the troop the player picked — no switching behind their back
  const nextKind: Troop | null = left[selected] > 0 ? selected : null;
  // out of the picked troop? then a tap moves the last one of that kind instead
  const moving = useMemo(() => {
    if (!L || locked || left[selected] > 0) return null;
    let last = -1;
    placements.forEach((p, k) => p.kind === selected && (last = k));
    if (last < 0) return null;
    const without = prune(L, placements.filter((_, k) => k !== last));
    return { without, zone: deployable(L, simulate(L, without).final, without, selected) };
  }, [L, locked, left, selected, placements]);
  const zone = useMemo(
    () =>
      moving ? moving.zone : L && sim && !locked && nextKind ? deployable(L, sim.final, placements, nextKind) : new Set<number>(),
    [moving, L, sim, locked, nextKind, placements],
  );
  const focusReach = useMemo(() => {
    if (!L || focus == null) return null;
    const p = shown.find((q) => q.i === focus);
    return p ? new Set(reach(L, p.i, p.kind)) : null;
  }, [L, focus, shown]);

  // seasonal skins redraw the troops and terrain
  const art = (data?.skin?.art ?? undefined) as Art;
  const total = L ? armyKinds(L).reduce((n, k) => n + countOf(L, k), 0) : 0;

  function place(next: Placement[]) {
    setPlacements(next);
    if (!data || !L) return;
    // practice freely: the best layout of the day is kept, tap it to bring it back
    const score = simulate(L, next).score;
    const newBest = !best || score > best.score ? { score, placements: next } : null;
    if (newBest && next.length) setBest(newBest);
    try {
      localStorage.setItem(DRAFT, JSON.stringify({ day: data.day, placements: next }));
      if (newBest && next.length) localStorage.setItem(BEST, JSON.stringify({ day: data.day, ...newBest }));
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
      setSelected(placements[at].kind as Troop);
      return;
    }
    if (moving) {
      if (moving.zone.has(i)) place([...moving.without, { i, kind: selected }]);
      return;
    }
    if (!nextKind || !zone.has(i)) return;
    const kind = nextKind;
    place([...placements, { i, kind }]);
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
      const er = await fetch("/api/commander/enlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side: guestSide ?? storedSide() ?? "blue" }),
      });
      if (!er.ok) {
        const ej = (await er.json().catch(() => ({}))) as { error?: string };
        setError(ej.error ?? "We couldn't enlist you just now. Try Attack again in a moment.");
        return;
      }
      void load(); // reloads as an enlisted player and posts the saved score
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
        if (j.needsEnlist) {
          setNeedLogin(true);
          setEnlistOpen(true);
        } else setError(j.error ?? "Couldn't post your score — tap Attack again in a moment.");
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

  // a friend's shared path: check on load and again once you've attacked
  useEffect(() => {
    if (!pathId) return;
    let alive = true;
    fetch(`/api/commander/path?id=${pathId}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: FriendPath | null) => {
        if (alive && d && !d.mine) setFriend(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathId, result]);
  // your own path link is made ahead of time, so the phone share sheet opens instantly
  useEffect(() => {
    if (!result || !data?.signedIn || myPathId) return;
    fetch("/api/commander/path", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day: data.day }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { id?: string } | null) => d?.id && setMyPathId(d.id))
      .catch(() => {});
  }, [result, data?.signedIn, data?.day, myPathId]);

  useEffect(() => {
    if (!myPathId || pathImg) return;
    fetch(`/s/${myPathId}/board?v=2`)
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => b && setPathImg(new File([b], `commanderbg-${data?.day ?? ""}.png`, { type: "image/png" })))
      .catch(() => {});
  }, [myPathId, pathImg, data?.day]);

  // Share (Tim, 2026-10-18): simple and spoiler-free — what your troops took,
  // your medal, and a link that opens the same puzzle. Never the best score.
  function shareLink() {
    return `https://commanderbg.com/d/${data?.day ?? 1}`;
  }
  // Share score (Tim, 2026-10-21): the board number, your stars, the link —
  // no score, so it never hints at the best possible.
  function shareText() {
    if (!data || !result) return "";
    const lines = [`CommanderBG #${data.day}`];
    if (result.medal) lines.push(`My Rank: ${STARS[result.medal]}`);
    lines.push(`Play 👉 ${shareLink().replace("https://", "")}`);
    return lines.join("\n");
  }

  function pathLink() {
    return `https://commanderbg.com/s/${myPathId ?? ""}`;
  }
  // Share path (Tim, 2026-10-21): a picture of your whole board (attached on
  // phones) with a short caption and the link. Where a picture can't go along
  // (X, web share links), the link preview shows the same board.
  function pathText() {
    if (!data || !result) return "";
    const stars = result.medal ? " " + STARS[result.medal] : "";
    return [`CommanderBG #${data.day}${stars}`, `Play it 👉 ${pathLink().replace("https://", "")}`].join("\n");
  }

  // Share (Tim, 2026-10-21): one tap. Score copies the spoiler-free text. Path
  // opens the share sheet on phones (picture + caption + tappable link in one
  // message); on computers it copies the picture, with the caption alongside
  // for apps that paste text.
  async function share(mode: ShareMode) {
    if (mode === "path" && !myPathId) return;
    const text = mode === "path" ? pathText() : shareText();
    track("commander_share", { via: "copy", mode });
    const done = () => {
      setCopied(mode);
      window.setTimeout(() => setCopied(null), 2500);
    };
    try {
      const phone = !!navigator.share && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
      if (mode === "path" && phone && pathImg && navigator.canShare?.({ files: [pathImg], text })) {
        await navigator.share({ files: [pathImg], text });
        return;
      }
      if (mode === "path" && pathImg && typeof ClipboardItem !== "undefined") {
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": pathImg, "text/plain": new Blob([text], { type: "text/plain" }) })]);
        } catch {
          // some browsers take one kind per copy — the picture alone
          await navigator.clipboard.write([new ClipboardItem({ "image/png": pathImg })]);
        }
        return done();
      }
      await navigator.clipboard.writeText(text);
      done();
    } catch {
      /* clipboard blocked */
    }
  }

  if (error && !data) return <div className="cm-wrap"><p className="cm-note">{error}</p></div>;
  if (!data || !L || !sim) return <LoadingBoard />;

  if (!side)
    return (
      <div className="cm-wrap">
        <Header day={data.day} today={data.today} onNext={() => setRemindOpen(true)} side={side} />
        <div className="ob-overlay" role="dialog" aria-label="Choose your color">
          <div className="ob-card">
            {signIn ? (
              <LoginOtp
                onBack={() => setSignIn(false)}
                onSignedIn={() => {
                  setSignIn(false);
                  void load(); // your color comes back with your account
                }}
              />
            ) : (
            <>
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
            <button className="ob-skip" onClick={() => setSignIn(true)}>Already enlisted? Log in</button>
            </>
            )}
          </div>
        </div>
      </div>
    );

  const at = new Map<number, Kind>(shown.map((p) => [p.i, p.kind]));
  // after you've submitted, number the troops so you can learn the order —
  // on your layout and on the best one (never while you're still playing)
  const order = locked ? new Map(shown.map((p, k) => [p.i, k + 1])) : null;
  at.set(L.commander, "commander");
  // trail markers: which way each captured square was taken (the latest troop wins)
  const trails = new Map<number, string>();
  for (const p of shown) for (const { t, dir } of trail(L, p.i, p.kind)) trails.set(t, dir);

  return (
    <div className={"cm-wrap side-" + side + (art ? " art-" + art : "")} style={{ ...skinStyle(data.skin), ["--them-alpha" as string]: `${enemyAlpha}%` }}>
      {art === "thanksgiving" && <FallingLeaves />}
      {art === "holiday" && <FallingLeaves snow count={36} />}
      <Header day={data.day} today={data.today} layout={L} onNext={() => setRemindOpen(true)} side={side} signedIn={data.signedIn} onLogin={() => setSignIn(true)} onSettings={() => setSettingsOpen(true)} />
      {signIn && (
        <div className="ob-overlay" role="dialog" aria-label="Log in" onClick={() => setSignIn(false)}>
          <div className="ob-card" onClick={(e) => e.stopPropagation()}>
            <LoginOtp
              onBack={() => setSignIn(false)}
              onSignedIn={() => {
                setSignIn(false);
                void load();
              }}
            />
          </div>
        </div>
      )}
      {unsubscribed && <div className="cm-banner">You won&apos;t get CommanderBG reminders anymore.</div>}
      {data.day < data.today && (
        <p className="cm-past">
          A past puzzle — play it and post a score. Main-map rewards come from <Link href="/">today&apos;s map</Link>.
        </p>
      )}

      {friend?.locked && !result && (
        <div className="cm-banner">🔒 A friend shared their battle plan for #{friend.day} — it unlocks after you attack.</div>
      )}
      {showFriend && result && friend?.placements && (
        <div className="cm-banner">
          FRIEND&apos;S PATH · {friend.score} squares · <button className="cm-link" onClick={() => setShowFriend(false)}>show mine</button>
        </div>
      )}
      {showOptimal && result && (
        <div className="cm-banner">BEST LAYOUT · {result.optimal} squares · <button className="cm-link" onClick={() => setShowOptimal(false)}>show mine</button></div>
      )}

      <div className="cm-scorebar">
        <button className="cm-rank" onClick={() => setRankOpen(true)} title="Your rank — see how ranks work">
          {data.rank && data.rank.rank.insignia.kind !== "none" ? <Insignia ins={data.rank.rank.insignia} size={26} /> : <span className="cm-rank-none" aria-hidden>☆</span>}
          <span className="cm-rank-txt">
            <span className="cm-rank-name">{data.rank ? data.rank.rank.name : "Recruit"}</span>
            <span className="cm-rank-pts">{data.rank ? `${data.rank.points} pts${data.rank.streak >= 2 ? ` · 🔥${data.rank.streak}` : ""}` : "see ranks"}</span>
          </span>
        </button>
        <div className="cm-score" aria-live="polite">
          <span className="cm-score-n">{sim.score}</span>
          <span className="cm-score-l">squares taken</span>
        </div>
        {!locked && (
          <div className="cm-practice">
            <button className="cm-chip" disabled={!best} onClick={() => best && place(best.placements)} title="Load your best layout">
              ★ Best: {best ? best.score : "—"}
            </button>
            <button className="cm-chip" disabled={!placements.length} onClick={() => place([])}>↺ Reset</button>
          </div>
        )}
      </div>

      <div className="cm-board" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }} onMouseLeave={() => setFocus(null)}>
        {Array.from({ length: CELLS }, (_, i) => {
          const t = L.terrain[i];
          const kind = at.get(i);
          const cls = [
            "cm-tile",
            t === WALL ? "wall " + wallClass(L.terrain, i, SIZE, WALL) : t === WATER ? "water" : t === TREE ? "tree" : "",
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
              style={sway(i)}
              onMouseEnter={() => kind && setFocus(i)}
              aria-label={`tile ${i % SIZE},${Math.floor(i / SIZE)}${kind ? " " + kind : ""}`}
            >
              {t === TREE && <TreeSprite art={art} />}
              {t === WATER && <Ripple />}
              {t !== TREE && ownable(L, i) && !kind && hasTuft(i) && <Tuft />}
              {!kind && trails.has(i) && <span className={"cm-trail " + trails.get(i)} aria-hidden />}
              {kind && (
                <span className={"cm-troop " + side}>
                  <TroopIcon kind={kind} art={art} />
                  {order?.has(i) && <span className="cm-plus">{order.get(i)}</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!locked ? (
        <>
          <div className="cm-tray">
            {TROOPS.map((k) => (
              <button key={k} className={"cm-troop-btn" + (selected === k ? " on" : "") + (left[k] <= 0 ? " empty" : "")} onClick={() => setSelected(k)}>
                <span className="cm-unit">
                  <span className={"cm-troop " + side}><TroopIcon kind={k} art={art} /></span>
                  <Notches kind={k} />
                </span>
                <span className="cm-tb-name">{NAME[k]} ×{left[k]}</span>
                <span className="cm-tb-blurb">{BLURB[k]}</span>
              </button>
            ))}
          </div>
          <p className="cm-hint">
            {placements.length < total && left[selected] <= 0
              ? `All ${NAME[selected]}s are out — tap a glowing tile to move your last ${NAME[selected]} there.`
              : placements.length < total
                ? "Deploy on your ground (the glowing tiles). Order matters. Tap a troop to pick it back up. Practice all you like — only Attack counts."
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
          {friend?.placements && (
            <button
              className="ob-btn cm-dark"
              onClick={() => {
                setShowOptimal(false);
                setShowFriend((v) => !v);
              }}
            >
              {showFriend ? "SHOW MY LAYOUT" : `COMPARE: FRIEND'S PATH (${friend.score})`}
            </button>
          )}
          <button
            className="ob-skip"
            onClick={() => {
              setShowFriend(false);
              setShowOptimal((v) => !v);
            }}
          >
            {showOptimal ? "show my layout" : "view best layout"}
          </button>
        </div>
      )}

      <details className="cm-how">
        <summary>How to play</summary>
        <div className="cm-how-btns">
          <button className="ob-btn cm-watch" onClick={() => setDemoOpen(true)}>▶ WATCH THE VIDEO</button>
          <Link className="ob-btn cm-linkbtn cm-watch" href="/commander/tutorial">PLAY THE TUTORIAL →</Link>
        </div>
        <p className="cm-how-lead">The whole map starts as the enemy&apos;s. Turn as many squares to your color as you can.</p>
        <div className="cm-how-row">
          <span className="cm-unit cm-how-unit">
            <span className={"cm-troop " + side}><TroopIcon kind="commander" art={art} /></span>
          </span>
          <span><b>Commander</b> — already on the field. Holds the 3×3 around it: that&apos;s where you start.</span>
        </div>
        <div className="cm-how-row">
          <span className="cm-unit cm-how-unit">
            <span className={"cm-troop " + side}><TroopIcon kind="archer" art={art} /></span>
            <Notches kind="archer" />
          </span>
          <span><b>Archer</b> — takes 3 squares left and 3 right. Arrows fly over walls and water; a tree stops them.</span>
        </div>
        <div className="cm-how-row">
          <span className="cm-unit cm-how-unit">
            <span className={"cm-troop " + side}><TroopIcon kind="soldier" art={art} /></span>
            <Notches kind="soldier" />
          </span>
          <span><b>Soldier</b> — takes 2 squares up and 2 down. Marches through trees (and takes them), wades through water (costs a step); walls stop them.</span>
        </div>
        <div className="cm-how-row">
          <span className="cm-unit cm-how-unit">
            <span className={"cm-troop " + side}><TroopIcon kind="scout" art={art} /></span>
            <Notches kind="scout" />
          </span>
          <span><b>Scout</b> <i className="cm-new">NEW</i> — takes 2 squares along each diagonal (an X). Hops over water; walls and trees stop it. Some days bring Scouts instead of Archers or Soldiers.</span>
        </div>
        <div className="cm-how-terrain">
          <span><i className="cm-sw wall" /> Wall — stops Soldiers &amp; Scouts</span>
          <span><i className="cm-sw water" /> Water — Soldiers wade, Scouts hop</span>
          <span><i className="cm-sw tree"><span className="cm-tree-mark" /></i> Tree — stops arrows &amp; Scouts</span>
        </div>
        <ul>
          <li>Troops can only stand on ground you hold — including ground you just took. Order matters.</li>
          <li>Faint ‹ › ˄ ˅ ↖ ↘ marks on your squares show which way each was taken.</li>
          <li>Practice as much as you like — your best layout is saved (★). Only Attack counts.</li>
          <li>A new map every day, the same for everyone. Monday is the easiest, Friday and Saturday the hardest.</li>
          <li>One shot. Score 90% of the best possible for a free 1×1 on the main map; hit perfect for a 2×2.</li>
        </ul>
      </details>

      {!demoOpen && !scoutSeen && !locked && countOf(L, "scout") > 0 && (
        <div className="ob-overlay" role="dialog" aria-label="New troop: the Scout">
          <div className="ob-card cm-newtroop">
            <div className="ob-kicker">◆ NEW TROOP ◆</div>
            <h2 className="ob-title">THE SCOUT</h2>
            <span className="cm-unit cm-newtroop-unit">
              <span className={"cm-troop " + side}><TroopIcon kind="scout" art={art} /></span>
              <Notches kind="scout" />
            </span>
            <p className="ob-body">
              Takes <b>2 squares along each diagonal</b> — an X. It hops over water; walls and trees stop it. Today it fights alongside your{" "}
              {countOf(L, "archer") > 0 ? "Archers" : "Soldiers"}.
            </p>
            <button
              className="ob-btn"
              onClick={() => {
                setScoutSeen(true);
                try {
                  localStorage.setItem("bg_seen_scout", "1");
                } catch {
                  /* ignore */
                }
              }}
            >
              GOT IT →
            </button>
          </div>
        </div>
      )}

      {settingsOpen && <SettingsModal enemyAlpha={enemyAlpha} onClose={() => setSettingsOpen(false)} />}
      {rankOpen && <RankModal rank={data.rank ?? null} signedIn={!!data.signedIn} side={side} onClose={() => setRankOpen(false)} />}

      {demoOpen && (
        <div className="ob-overlay" role="dialog" aria-label="How to play video" onClick={() => setDemoOpen(false)}>
          <div className="ob-card cm-demo-card" onClick={(e) => e.stopPropagation()}>
            <button className="cm-x" onClick={() => setDemoOpen(false)} aria-label="Close">×</button>
            <div className="ob-kicker">◆ HOW TO PLAY ◆</div>
            <video className="cm-demo" src="/commander-demo.mp4" autoPlay muted playsInline controls aria-label="A 55-second demo of how to play" />
            <label className="ob-consent">
              <input
                type="checkbox"
                className="ob-check"
                checked={demoAuto}
                onChange={(e) => {
                  setDemoAuto(e.target.checked);
                  try {
                    localStorage.setItem(DEMO_PREF, e.target.checked ? "on" : "off");
                  } catch {
                    /* ignore */
                  }
                }}
              />
              <span className="ob-consent-txt">Play this video every time I open CommanderBG</span>
            </label>
            <button className="ob-btn" onClick={() => setDemoOpen(false)}>LET&apos;S PLAY →</button>
            <Link className="ob-skip" href="/commander/tutorial">or learn by playing — the 2-minute tutorial</Link>
          </div>
        </div>
      )}

      {remindOpen && <RemindModal signedIn={data.signedIn} onClose={() => setRemindOpen(false)} />}

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
            ) : enlistOpen ? (
              <EnlistInline
                side={side}
                onBack={() => setEnlistOpen(false)}
                onDone={() => {
                  setEnlistOpen(false);
                  setNeedLogin(false);
                  void load(); // signed in + enlisted now: the saved score posts and results open
                }}
              />
            ) : (
              <>
                <div className="ob-kicker">◆ POST YOUR SCORE ◆</div>
                <h2 className="ob-title">{sim.score} POINTS</h2>
                <p className="ob-body">
                  Scores post under your name. New here? Enlist free — it takes an email and a code, you stay right here, and you get a free
                  square on the Battleground.
                </p>
                <button className="ob-btn" onClick={() => setEnlistOpen(true)}>ENLIST FREE →</button>
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
          enlisted={!!data.side}
          copied={copied}
          canSharePath={!!myPathId}
          onShare={share}
          onClose={() => setShowResult(false)}
          onOptimal={() => {
            setShowFriend(false);
            setShowOptimal(true);
            setShowResult(false);
          }}
        />
      )}
    </div>
  );
}

const dayHref = (n: number, today: number) => (n >= today ? "/" : `/?day=${n}`);

function Header({ day, today, layout, onNext, side, signedIn, onLogin, onSettings }: { day: number; today: number; layout?: Layout; onNext: () => void; side?: Side | null; signedIn?: boolean; onLogin?: () => void; onSettings?: () => void }) {
  return (
    <>
      <Link className="go-battle" href="/battleground">
        <span className="go-battle-new">LIVE MAP</span>
        <span className="go-battle-art" aria-hidden>
          {"rbbrbrrbrrbbbbrr".split("").map((c, k) => (
            <i key={k} className={c === "r" ? "r" : "b"} />
          ))}
        </span>
        <span className="go-battle-txt">
          <span className="go-battle-k">THE BATTLEGROUND</span>
          <span className="go-battle-t">Red vs Blue on one live map — take squares for your side</span>
        </span>
        <span className="go-battle-play">PLAY ▶</span>
      </Link>
      <div className="cm-head">
        <span />
        <h1 className="cm-title">
          <CommanderLogo side={side} />
        </h1>
        {onLogin ? <Menu signedIn={!!signedIn} onLogin={onLogin} onSettings={onSettings} /> : <span />}
      </div>
      <div className="cm-daynav">
        {day > 1 ? <Link href={dayHref(day - 1, today)}>‹ Prev</Link> : <span />}
        <span className="cm-daynav-l">
          Day {day}
          {layout ? ` · ${WEEKDAY[layout.weekday]} · ${DIFFICULTY_NAME[DIFFICULTY[layout.weekday]]}` : ""}
          {day === today ? " · today" : ""}
        </span>
        {day < today ? (
          <Link href={dayHref(day + 1, today)}>Next ›</Link>
        ) : (
          <button className="cm-link-btn" onClick={onNext}>Next ›</button>
        )}
      </div>
    </>
  );
}

/** Your store skin's colors on the board (lighter "taking" and darker enemy shades derived). */
function skinStyle(skin?: { me: string; them: string } | null): React.CSSProperties | undefined {
  if (!skin) return undefined;
  return {
    ["--me" as string]: skin.me,
    ["--me-l" as string]: `color-mix(in srgb, ${skin.me} 62%, white)`,
    ["--them" as string]: skin.them,
    ["--them-d" as string]: `color-mix(in srgb, ${skin.them} 78%, black)`,
  } as React.CSSProperties;
}

/** Top-right hamburger: the store, and Log in / Log out. */
function Menu({ signedIn, onLogin, onSettings }: { signedIn: boolean; onLogin: () => void; onSettings?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="cm-menu">
      <button className="cm-burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span />
        <span />
        <span />
      </button>
      {open && (
        <>
          <div className="cm-menu-scrim" onClick={() => setOpen(false)} />
          <div className="cm-menu-list" role="menu">
            <Link href="/store" role="menuitem" className="cm-menu-link">
              Store · skins
            </Link>
            {onSettings && (
              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onSettings();
                }}
              >
                Settings
              </button>
            )}
            {signedIn ? (
              <form action="/auth/sign-out" method="post">
                <button type="submit" role="menuitem">Log out</button>
              </form>
            ) : (
              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onLogin();
                }}
              >
                Log in
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Time until the next map (midnight in Denver). */
function untilNextMap(now: number) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", hour: "numeric", minute: "numeric", second: "numeric", hour12: false }).formatToParts(new Date(now));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0) % 24;
  const left = 86400 - (get("hour") * 3600 + get("minute") * 60 + get("second"));
  const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), x = left % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}`;
}

function RemindModal({ signedIn, onClose }: { signedIn: boolean; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  async function save() {
    setState("saving");
    setError(null);
    const r = await fetch("/api/commander/remind", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signedIn ? {} : { email }),
    }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok) {
      setState("done");
      pixel("Lead", { content_name: "commander reminder" });
    }
    else {
      setError(j.error ?? "Couldn't save that — try again.");
      setState("idle");
    }
  }
  return (
    <div className="ob-overlay" role="dialog" aria-label="Remind me tomorrow" onClick={onClose}>
      <div className="ob-card" onClick={(e) => e.stopPropagation()}>
        <div className="ob-kicker">◆ TOMORROW&apos;S BATTLE ◆</div>
        <h2 className="ob-title">NOT YET!</h2>
        <p className="ob-body">
          A new map drops at midnight Mountain — in <b>{untilNextMap(now)}</b>.
        </p>
        {state === "done" ? (
          <>
            <p className="ob-body">✓ You&apos;re on the list — we&apos;ll email you when it&apos;s live (around 8am Mountain).</p>
            <button className="ob-btn" onClick={onClose}>BACK TO TODAY&apos;S MAP</button>
          </>
        ) : (
          <>
            <p className="ob-body">Want a heads-up when it&apos;s live? One email a day, stop anytime.</p>
            {!signedIn && (
              <input
                className="ob-input"
                type="email"
                placeholder="you@email.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && save()}
              />
            )}
            {error && <p className="ct-error">{error}</p>}
            <button className="ob-btn" onClick={save} disabled={state === "saving" || (!signedIn && !email.trim())}>
              {state === "saving" ? "SAVING…" : "REMIND ME TOMORROW"}
            </button>
            <button className="ob-skip" onClick={onClose}>‹ back to today&apos;s map</button>
          </>
        )}
      </div>
    </div>
  );
}

export function ResultsModal({
  day,
  result,
  enlisted = true,
  copied,
  canSharePath,
  onShare,
  onClose,
  onOptimal,
}: {
  day: number;
  result: Result;
  enlisted?: boolean;
  copied: ShareMode | null;
  canSharePath: boolean;
  onShare: (mode: ShareMode) => void;
  onClose: () => void;
  onOptimal: () => void;
}) {
  const t = result.thresholds;
  const lo = Math.min(t.bronze - 5, ...result.histogram.map((h) => h.score), result.score);
  const hi = result.optimal;
  const buckets = Array.from({ length: Math.max(1, hi - lo + 1) }, (_, k) => lo + k);
  const count = new Map(result.histogram.map((h) => [h.score, h.players]));
  const max = Math.max(1, ...result.histogram.map((h) => h.players));
  // how you stack up against everyone who played this day
  const total = result.histogram.reduce((n, h) => n + h.players, 0);
  const rank = 1 + result.histogram.filter((h) => h.score > result.score).reduce((n, h) => n + h.players, 0);
  const tied = Math.max(0, (count.get(result.score) ?? 1) - 1);
  const top = Math.max(1, Math.round((rank / Math.max(1, total)) * 100));
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
        <div className="cm-lines">⭐ {t.bronze}+ · ⭐⭐ {t.silver}+ · ⭐⭐⭐ {t.gold}+ · 🏰 {t.perfect}</div>
        <div className="cm-standing">
          {total <= 1 ? (
            <span>
              <b>1</b> player — you&apos;re the first to post a score
            </span>
          ) : (
            <span>
              <b>#{rank}</b> of <b>{total}</b> players
            </span>
          )}
          {total >= 5 && (
            <span>
              top <b>{top}%</b>
            </span>
          )}
          {tied > 0 && (
            <span>
              tied with <b>{tied}</b> other{tied === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <div className="cm-hist" aria-label="Score distribution">
          {buckets.map((s) => {
            const n = count.get(s) ?? 0;
            const me = s === result.score;
            return (
              <div key={s} className={"cm-bar" + (me ? " you" : "")} style={{ height: `${(n / max) * 100}%` }}>
                {(me || n > 0) && <span className={me ? "cm-you" : "cm-n"}>{me ? (n > 1 ? `You +${n - 1}` : "You") : n}</span>}
                {n > 0 && <span className="cm-sc">{s}</span>}
              </div>
            );
          })}
        </div>
        {result.reward ? (
          <Link className="go-battle cm-reward won" href="/battleground">
            <span className="go-battle-new">YOU EARNED</span>
            <span className={"cm-rw-piece " + (result.reward === "2x2" ? "two" : "one")} aria-hidden>
              {Array.from({ length: result.reward === "2x2" ? 4 : 1 }, (_, k) => (
                <i key={k} />
              ))}
            </span>
            <span className="go-battle-txt">
              <span className="go-battle-k">FREE {result.reward === "2x2" ? "2×2" : "1×1"}</span>
              <span className="go-battle-t">It&apos;s in your supplies — go take ground on the Battleground</span>
            </span>
            <span className="go-battle-play">USE IT ▶</span>
          </Link>
        ) : (
          <Link className="go-battle cm-reward" href="/battleground">
            <span className="go-battle-new">{enlisted ? "BONUS" : "PLAY FREE"}</span>
            <span className="go-battle-art" aria-hidden>
              {"rbbrbrrbrrbbbbrr".split("").map((c, k) => (
                <i key={k} className={c === "r" ? "r" : "b"} />
              ))}
            </span>
            <span className="go-battle-txt">
              <span className="go-battle-k">THE BATTLEGROUND</span>
              <span className="cm-rw-chips">
                <span>{t.gold}+ → free 1×1</span>
                <span>{t.perfect} → free 2×2</span>
              </span>
            </span>
            <span className="go-battle-play">PLAY ▶</span>
          </Link>
        )}
        <div className="cm-res-btns">
          {(["score", "path"] as const)
            .filter((m) => m === "score" || canSharePath)
            .map((m) => (
              <button
                key={m}
                className={"ob-btn" + (m === "path" ? " cm-dark" : "")}
                title={m === "score" ? "Copies your score and stars — no hints" : "Copies a picture of your board"}
                onClick={() => onShare(m)}
              >
                {copied === m ? "COPIED ✓" : m === "score" ? "SHARE SCORE" : "SHARE PATH"}
              </button>
            ))}
          {result.score < result.optimal && <button className="ob-btn cm-dark" onClick={onOptimal}>VIEW BEST</button>}
        </div>
        {copied && <p className="cm-share-note">Copied — paste it anywhere.</p>}
        <Link className="ob-skip" href="/battleground">‹ back to the main map</Link>
      </div>
    </div>
  );
}

/** The rank ladder, fully open: every rank, what it takes, and how points are earned. */
function RankModal({ rank, signedIn, side, onClose }: { rank: CmdRank | null; signedIn: boolean; side: Side; onClose: () => void }) {
  const pts = rank?.points ?? 0;
  const cur = rank?.rank.key ?? "recruit";
  const officer = rank?.track === "officer";
  const steps = officer ? OFFICER_RANKS : ENLISTED_RANKS;
  const pct = rank?.next ? Math.max(0, Math.min(100, Math.round(((pts - rank.rank.req) / (rank.next.req - rank.rank.req)) * 100))) : 100;
  return (
    <div className="ob-overlay" role="dialog" aria-label="Ranks" onClick={onClose}>
      <div className={"ob-card cm-ranks side-" + side} onClick={(e) => e.stopPropagation()}>
        <button className="cm-x" onClick={onClose} aria-label="Close">×</button>
        <div className="ob-kicker">◆ YOUR RANK · {officer ? "OFFICER" : "ENLISTED"} ◆</div>
        <div className="cm-ranks-me">
          {rank && rank.rank.insignia.kind !== "none" ? <Insignia ins={rank.rank.insignia} size={64} /> : <span className="cm-rank-none big">☆</span>}
          <div>
            <div className="cm-ranks-name">{rank?.rank.name ?? "Recruit"}</div>
            <div className="cm-ranks-pts">
              {pts} points{officer ? " as an officer" : ""}
              {rank && rank.streak > 0 ? ` · 🔥 ${rank.streak}-day streak` : ""}
            </div>
          </div>
        </div>
        {rank?.next ? (
          <>
            <div className="cm-ranks-bar"><i style={{ width: `${pct}%` }} /></div>
            <p className="cm-ranks-next">
              <b>{rank.toNext}</b> more point{rank.toNext === 1 ? "" : "s"} to <b>{rank.next.name}</b>
            </p>
          </>
        ) : rank ? (
          <p className="cm-ranks-next">{officer ? "General — the top of the army." : "Top of the enlisted ranks."}</p>
        ) : null}
        {rank?.floored && <p className="cm-ranks-fine">You keep the rank you earned before ranks were rescaled — points now climb on the new scale.</p>}
        {!signedIn && <p className="cm-ranks-next">Enlist (free) when you post a score to start earning rank.</p>}
        {rank && rank.streak > 0 && (
          <p className="cm-ranks-tip">
            {rank.boosted ? "Your streak is boosted — each day you play is worth 2 points." : `Play ${STREAK_DAYS - rank.streak} more day${STREAK_DAYS - rank.streak === 1 ? "" : "s"} in a row to boost every day to 2 points.`}
          </p>
        )}
        <div className="cm-ranks-rules">
          <div><b>+1</b> for every day you play that day&apos;s map</div>
          <div><b>+2</b> instead, once you&apos;ve played {STREAK_DAYS}+ days in a row</div>
          <div><b>+{PERFECT_BONUS}</b> more for a perfect score 🏰</div>
          <div className="cm-ranks-fine">Past days are for practice — they don&apos;t count toward rank.</div>
          <div className="cm-ranks-fine">
            {officer
              ? "Officers climb from 2nd Lieutenant on the points earned since their first purchase."
              : "Buy anything in the store and you're commissioned as an officer — starting at 2nd Lieutenant, climbing to General."}
          </div>
        </div>
        <ol className="cm-ladder">
          {steps.map((r) => (
            <li key={r.key} className={(r.key === cur ? "on " : "") + (pts >= r.req ? "got" : "")}>
              <span className="cm-ladder-ins">{r.insignia.kind !== "none" ? <Insignia ins={r.insignia} size={24} /> : "☆"}</span>
              <span className="cm-ladder-name">{r.name}</span>
              <span className="cm-ladder-req">{r.req} pts</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ---- Settings (Tim, 2026-10-22): kept in this browser ----
const ENEMY_ALPHA_KEY = "bg_cm_enemy_alpha";
const ENEMY_ALPHA_DEFAULT = 100; // % — how solid the enemy's color is (players can lower it)
function subscribeSettings(cb: () => void) {
  window.addEventListener("bg-cm-settings", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("bg-cm-settings", cb);
    window.removeEventListener("storage", cb);
  };
}
function readEnemyAlpha(): number {
  try {
    const v = Number(localStorage.getItem(ENEMY_ALPHA_KEY));
    return localStorage.getItem(ENEMY_ALPHA_KEY) !== null && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : ENEMY_ALPHA_DEFAULT;
  } catch {
    return ENEMY_ALPHA_DEFAULT;
  }
}
function saveEnemyAlpha(v: number) {
  try {
    localStorage.setItem(ENEMY_ALPHA_KEY, String(v));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event("bg-cm-settings"));
}

function SettingsModal({ enemyAlpha, onClose }: { enemyAlpha: number; onClose: () => void }) {
  return (
    <div className="ob-overlay cm-settings-overlay" role="dialog" aria-label="Settings" onClick={onClose}>
      <div className="ob-card cm-settings" onClick={(e) => e.stopPropagation()}>
        <button className="cm-x" onClick={onClose} aria-label="Close">×</button>
        <div className="ob-kicker">◆ SETTINGS ◆</div>
        <label className="cm-set-row">
          <span className="cm-set-label">
            Enemy color <b>{enemyAlpha}%</b>
          </span>
          <input type="range" min={0} max={100} step={5} value={enemyAlpha} onChange={(e) => saveEnemyAlpha(Number(e.target.value))} />
          <span className="cm-set-fine">Lower makes the enemy&apos;s squares see-through, so your ground stands out.</span>
        </label>
        <button className="ob-skip" onClick={() => saveEnemyAlpha(ENEMY_ALPHA_DEFAULT)}>
          reset to {ENEMY_ALPHA_DEFAULT}%
        </button>
      </div>
    </div>
  );
}

/** While the day loads: the page's shape with a blank board that ripples, so nothing jumps when the map arrives. */
function LoadingBoard() {
  return (
    <div className="cm-wrap" aria-busy="true">
      <div className="cm-skel cm-skel-banner" />
      <div className="cm-head">
        <span />
        <h1 className="cm-title">
          <CommanderLogo side="blue" />
        </h1>
        <span />
      </div>
      <div className="cm-skel cm-skel-line" />
      <div className="cm-board cm-board-loading" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }} aria-label="Loading today's battlefield">
        {Array.from({ length: CELLS }, (_, i) => (
          <div key={i} className="cm-tile cm-tile-loading" style={{ animationDelay: `${((i % SIZE) + Math.floor(i / SIZE)) * 60}ms` }} />
        ))}
      </div>
      <p className="cm-loading-txt">Scouting today&apos;s battlefield…</p>
    </div>
  );
}
