"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CELLS, SIZE, TREE, WALL, WATER, deployable, ownable, prune, simulate, solve, trail, type Kind, type Placement } from "@/lib/commander/engine";
import { DEMO_LAYOUT } from "@/lib/commander/demo-map";
import { Notches, TroopIcon } from "./icons";

// The interactive tutorial (/commander/tutorial): five short steps on the same
// map as the how-to-play video. Each step hands you a few troops and a goal;
// you move on once you reach it — like enclose.horse's tutorial.

type Troop = "archer" | "soldier";
type Step = { title: string; text: string; archer: number; soldier: number; goal: number; answer?: boolean };

const STEPS: Step[] = [
  {
    title: "Meet your Archer",
    text: "Your Commander holds the 9 squares around it — that's your ground. Tap a glowing square to place your Archer. It takes 3 squares left and 3 right, flying over walls; a tree stops it.",
    archer: 1,
    soldier: 0,
    goal: 12,
  },
  {
    title: "Meet your Soldier",
    text: "Soldiers take 2 squares up and 2 down. They march through trees and wade through water; a wall stops them.",
    archer: 0,
    soldier: 1,
    goal: 10,
  },
  {
    title: "Order matters",
    text: "Troops can only stand on ground you hold — including ground you just took. Place one troop, then build on the ground it won.",
    archer: 1,
    soldier: 1,
    goal: 16,
  },
  {
    title: "Think ahead",
    text: "The obvious move isn't always the best one. Plan a chain of troops that takes 25 squares.",
    archer: 2,
    soldier: 2,
    goal: 25,
    answer: true,
  },
  {
    title: "A real puzzle",
    text: "Three Archers, three Soldiers — this is what a daily map feels like. The best possible is 35. Can you find it?",
    archer: 3,
    soldier: 3,
    goal: 35,
    answer: true,
  },
];

const NAME: Record<Troop, string> = { archer: "Archer", soldier: "Soldier" };

function storedSide(): "red" | "blue" {
  try {
    return localStorage.getItem("bg_commander_side") === "red" ? "red" : "blue";
  } catch {
    return "blue";
  }
}

export function CommanderTutorial() {
  const [step, setStep] = useState(0);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selected, setSelected] = useState<Troop>("archer");
  const [done, setDone] = useState(false);
  const [side] = useState<"red" | "blue">(() => (typeof window === "undefined" ? "blue" : storedSide()));

  const S = STEPS[step];
  const L = useMemo(() => ({ ...DEMO_LAYOUT, troops: { archer: S.archer, soldier: S.soldier } }), [S]);
  const sim = useMemo(() => simulate(L, placements), [L, placements]);
  const left = { archer: S.archer - placements.filter((p) => p.kind === "archer").length, soldier: S.soldier - placements.filter((p) => p.kind === "soldier").length };
  const kinds = (["archer", "soldier"] as Troop[]).filter((k) => S[k] > 0);
  const kind: Troop = S[selected] > 0 ? selected : kinds[0];
  const won = sim.score >= S.goal;

  // out of this troop? a tap moves the last one of that kind (same as the daily game)
  const moving = useMemo(() => {
    if (placements.filter((p) => p.kind === kind).length < L.troops[kind]) return null;
    let last = -1;
    placements.forEach((p, k) => p.kind === kind && (last = k));
    if (last < 0) return null;
    const without = prune(L, placements.filter((_, k) => k !== last));
    return { without, zone: deployable(L, simulate(L, without).final, without, kind) };
  }, [L, placements, kind]);
  const zone = won ? new Set<number>() : moving ? moving.zone : left[kind] > 0 ? deployable(L, sim.final, placements, kind) : new Set<number>();

  function tap(i: number) {
    if (won) return;
    const at = placements.findIndex((p) => p.i === i);
    if (at >= 0) {
      setPlacements(prune(L, placements.filter((_, k) => k !== at)));
      setSelected(placements[at].kind as Troop);
      return;
    }
    if (!zone.has(i)) return;
    if (moving) setPlacements([...moving.without, { i, kind }]);
    else setPlacements([...placements, { i, kind }]);
  }

  function go(n: number) {
    if (n >= STEPS.length) {
      setDone(true);
      return;
    }
    setDone(false);
    setStep(n);
    setPlacements([]);
    setSelected(STEPS[n].archer > 0 ? "archer" : "soldier");
  }

  const at = new Map<number, Kind>(placements.map((p) => [p.i, p.kind]));
  at.set(L.commander, "commander");
  const trails = new Map<number, string>();
  for (const p of placements) for (const { t, dir } of trail(L, p.i, p.kind)) trails.set(t, dir);

  if (done)
    return (
      <div className={"cm-wrap side-" + side}>
        <TutHeader />
        <div className="cm-tut-done">
          <div className="ob-kicker">◆ TUTORIAL COMPLETE ◆</div>
          <h2 className="ob-title">YOU&apos;RE READY</h2>
          <ul>
            <li>A new map every day — the same one for everyone. Monday is the easiest, Friday and Saturday the hardest.</li>
            <li>Practice as much as you like; your best layout is saved. Only Attack counts.</li>
            <li>Score 90% of the best possible for a free square on the main map — a perfect score earns a 2×2.</li>
          </ul>
          <Link className="ob-btn cm-linkbtn" href="/commander">PLAY TODAY&apos;S MAP →</Link>
          <button className="ob-skip" onClick={() => go(0)}>replay the tutorial</button>
        </div>
      </div>
    );

  return (
    <div className={"cm-wrap side-" + side}>
      <TutHeader />
      <div className="cm-tut-dots" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((_, k) => (
          <span key={k} className={k === step ? "on" : k < step ? "past" : ""} />
        ))}
        <span className="cm-tut-count">
          {step + 1} / {STEPS.length}
        </span>
      </div>
      <h2 className="cm-tut-title">{S.title}</h2>
      <p className="cm-tut-text">{S.text}</p>

      <div className="cm-score">
        <span className="cm-score-n">{sim.score}</span>
        <span className="cm-score-l">
          squares · goal <b>{S.goal}</b>
        </span>
      </div>

      <div className="cm-board" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }}>
        {Array.from({ length: CELLS }, (_, i) => {
          const t = L.terrain[i];
          const k = at.get(i);
          const cls = [
            "cm-tile",
            t === WALL ? "wall" : t === WATER ? "water" : t === TREE ? "tree" : "",
            ownable(L, i) ? (sim.final[i] ? "you" : "enemy") : "",
            zone.has(i) && !k ? "deploy" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <button key={i} type="button" className={cls} onClick={() => tap(i)} aria-label={`tile ${i % SIZE},${Math.floor(i / SIZE)}${k ? " " + k : ""}`}>
              {t === TREE && <span className="cm-tree-mark" aria-hidden />}
              {!k && trails.has(i) && <span className={"cm-trail " + trails.get(i)} aria-hidden />}
              {k && (
                <span className={"cm-troop " + side}>
                  <TroopIcon kind={k} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {won ? (
        <div className="cm-tut-win">
          <div className="cm-tut-win-t">✓ {sim.score === S.goal ? "PERFECT" : "BETTER THAN PERFECT?!"}</div>
          <button className="ob-btn" onClick={() => go(step + 1)}>
            {step + 1 < STEPS.length ? "NEXT →" : "FINISH →"}
          </button>
        </div>
      ) : (
        <>
          <div className="cm-tray">
            {kinds.map((k) => (
              <button key={k} className={"cm-troop-btn" + (kind === k ? " on" : "") + (left[k] <= 0 ? " empty" : "")} onClick={() => setSelected(k)}>
                <span className="cm-unit">
                  <span className={"cm-troop " + side}>
                    <TroopIcon kind={k} />
                  </span>
                  <Notches kind={k} />
                </span>
                <span className="cm-tb-name">
                  {NAME[k]} ×{left[k]}
                </span>
              </button>
            ))}
          </div>
          <div className="cm-practice">
            <button className="cm-chip" disabled={!placements.length} onClick={() => setPlacements([])}>
              ↺ Reset
            </button>
            {S.answer && (
              <button className="cm-chip" onClick={() => setPlacements(solve(L).placements)}>
                Show me
              </button>
            )}
          </div>
          <p className="cm-hint">
            {left[kind] <= 0 && placements.length < S.archer + S.soldier
              ? `All ${NAME[kind]}s are out — tap a glowing square to move your last ${NAME[kind]} there.`
              : "Tap a glowing square to deploy. Tap a troop to pick it back up."}
          </p>
        </>
      )}

      <Link className="ob-skip cm-tut-skip" href="/commander">
        skip the tutorial
      </Link>
    </div>
  );
}

function TutHeader() {
  return (
    <div className="cm-head">
      <Link href="/commander" className="cm-back">
        ‹ today&apos;s map
      </Link>
      <h1 className="cm-title">COMMANDER</h1>
      <div className="cm-day">TUTORIAL</div>
    </div>
  );
}
