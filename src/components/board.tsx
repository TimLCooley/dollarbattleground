"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Announcer } from "./announcer";
import { Insignia, rankFor, type InsigniaSpec } from "@/lib/ranks";

const N = 15;
const TOTAL = N * N;

export type Team = "red" | "blue";
type CellVal = Team | null;
type Tool = "flip" | "x" | "strike";

function seedTufts(): boolean[] {
  let s = 991;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  return Array.from({ length: TOTAL }, () => rnd() < 0.16);
}

export interface Battleground {
  cells: CellVal[];
  counts: { b: number; r: number; n: number };
  popping: Set<number>;
  claim: (indices: number[], team: Team) => void;
}

// Live board backed by the shared Supabase `tiles` table: loads the current
// board, streams realtime changes, and persists flips through claim_tiles.
// Every view that calls this reads the same board, so all screens stay in sync.
export function useBattleground(): Battleground {
  const supabase = useMemo(() => createClient(), []);
  const [cells, setCells] = useState<CellVal[]>(() =>
    new Array(TOTAL).fill(null),
  );
  const [popping, setPopping] = useState<Set<number>>(new Set());

  const pop = useCallback((indices: number[]) => {
    setPopping((prev) => {
      const s = new Set(prev);
      indices.forEach((i) => s.add(i));
      return s;
    });
    window.setTimeout(() => {
      setPopping((prev) => {
        const s = new Set(prev);
        indices.forEach((i) => s.delete(i));
        return s;
      });
    }, 200);
  }, []);

  // Initial load of the whole board.
  useEffect(() => {
    let active = true;
    supabase
      .from("tiles")
      .select("x,y,team")
      .then(({ data, error }) => {
        if (!active || error || !data) return;
        setCells(() => {
          const next: CellVal[] = new Array(TOTAL).fill(null);
          for (const r of data as { x: number; y: number; team: CellVal }[]) {
            next[r.y * N + r.x] = r.team;
          }
          return next;
        });
      });
    return () => {
      active = false;
    };
  }, [supabase]);

  // Realtime: apply every tile change from any player.
  useEffect(() => {
    const channel = supabase
      .channel("tiles-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tiles" },
        (payload) => {
          const r = payload.new as { x: number; y: number; team: CellVal };
          if (r?.x == null || r?.y == null) return;
          const i = r.y * N + r.x;
          setCells((prev) => {
            if (prev[i] === r.team) return prev;
            const next = [...prev];
            next[i] = r.team;
            return next;
          });
          pop([i]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, pop]);

  const counts = useMemo(() => {
    let b = 0,
      r = 0;
    for (const c of cells) {
      if (c === "blue") b++;
      else if (c === "red") r++;
    }
    return { b, r, n: TOTAL - b - r };
  }, [cells]);

  const claim = useCallback(
    (indices: number[], team: Team) => {
      // Optimistic paint for instant feedback; realtime confirms it.
      setCells((prev) => {
        const next = [...prev];
        indices.forEach((i) => (next[i] = team));
        return next;
      });
      pop(indices);
      const p_cells = indices.map((i) => ({ x: i % N, y: Math.floor(i / N) }));
      supabase
        .rpc("claim_tiles", { p_cells, p_team: team })
        .then(({ error }) => {
          if (error) console.error("claim_tiles failed:", error.message);
        });
    },
    [supabase, pop],
  );

  return { cells, counts, popping, claim };
}

function xPattern(i: number): number[] {
  const x = i % N;
  const y = Math.floor(i / N);
  const out: number[] = [];
  (
    [
      [0, 0],
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const
  ).forEach(([dx, dy]) => {
    const nx = x + dx,
      ny = y + dy;
    if (nx >= 0 && nx < N && ny >= 0 && ny < N) out.push(ny * N + nx);
  });
  return out;
}

// Officer-tier "airstrike": a 3x3 block. (Exact $10 mechanic TBD — placeholder.)
function strikePattern(i: number): number[] {
  const x = i % N;
  const y = Math.floor(i / N);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx,
        ny = y + dy;
      if (nx >= 0 && nx < N && ny >= 0 && ny < N) out.push(ny * N + nx);
    }
  }
  return out;
}

function Crosshair() {
  return (
    <svg className="t-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="7" />
      <line x1="12" y1="1" x2="12" y2="5" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="1" y1="12" x2="5" y2="12" />
      <line x1="19" y1="12" x2="23" y2="12" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  );
}
function Burst() {
  return (
    <svg className="t-icon" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8 L7 13 L12 4 L17 13 L21 8 L19 19 L5 19 Z" />
    </svg>
  );
}
function Lock() {
  return (
    <svg className="t-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="1.5" fill="currentColor" stroke="none" />
      <path d="M8 11 V8 a4 4 0 0 1 8 0 v3" />
    </svg>
  );
}

interface BoardViewProps {
  board: Battleground;
  lockedSide?: Team; // /red and /blue (and a chosen player) lock you to a faction
  title?: string; // rank/command label shown in the header
  placementMode?: boolean; // onboarding "plant your flag" — next tap is a free claim
  onPlace?: (i: number) => void;
  isOfficer?: boolean; // unlocks the $10 officer action
  onPurchase?: (amount: number) => void; // fired on any paid action ($1/$5/$10)
  insignia?: InsigniaSpec; // rank insignia
  totalSpent?: number; // cumulative $ for the statbar (overrides local session)
  record?: { captures: number; points: number }; // Home war-record strip
}

export function BoardView({
  board,
  lockedSide,
  title,
  placementMode,
  onPlace,
  isOfficer,
  onPurchase,
  insignia,
  totalSpent,
  record,
}: BoardViewProps) {
  const { cells, counts, popping, claim } = board;
  const [internalSide, setInternalSide] = useState<Team>("blue");
  const side: Team = lockedSide ?? internalSide;
  const [tool, setTool] = useState<Tool>("flip");
  const [spent, setSpent] = useState(0);
  const [hint, setHint] = useState("Tap a position to take it.");
  const bonusArmed = useRef(false);

  const won = counts.n === 0;
  const pct = (v: number) => Math.round((v / TOTAL) * 100);
  const tufts = useMemo(seedTufts, []);

  const onTap = useCallback(
    (i: number) => {
      if (won) return;
      if (placementMode) {
        claim([i], side); // free first tile
        onPlace?.(i);
        return;
      }
      if (bonusArmed.current) {
        claim([i], side);
        bonusArmed.current = false;
        setHint("Bonus tile placed. ✦");
        return;
      }
      if (tool === "flip") {
        claim([i], side);
        setSpent((v) => v + 1);
        setHint("Flipped one tile.");
        onPurchase?.(1);
      } else if (tool === "x") {
        claim(xPattern(i), side);
        setSpent((v) => v + 5);
        bonusArmed.current = true;
        setHint("X placed! Now tap any tile — your bonus flip.");
        onPurchase?.(5); // buying a $5 action commissions you as an Officer
      } else if (tool === "strike" && isOfficer) {
        claim(strikePattern(i), side);
        setSpent((v) => v + 10);
        setHint("Airstrike! 3×3 block seized.");
        onPurchase?.(10);
      }
    },
    [won, tool, side, claim, placementMode, onPlace, isOfficer, onPurchase],
  );

  function pickSide(t: Team) {
    if (lockedSide) return;
    setInternalSide(t);
    setHint(`You are now on the ${t === "blue" ? "Blue" : "Red"} team.`);
  }

  function pickTool(t: Tool) {
    if (t === "strike" && !isOfficer) return; // officers only
    setTool(t);
    bonusArmed.current = false;
    setHint(
      t === "flip"
        ? "Tap a tile to flip it — $1."
        : t === "x"
          ? "Tap a center tile — X-flip 5 tiles for $5, then a bonus flip."
          : "Airstrike armed — tap a tile to seize a 3×3 block for $10.",
    );
  }

  return (
    <div className={"cartridge" + (lockedSide ? ` ${lockedSide}-cmd` : "")}>
      <header className="bg-header">
        <div className="wordmark">
          <span className="coin">$</span>battleground
        </div>
        <div className={"roundline rl-" + side}>
          <span className="rl-rank">{side.toUpperCase()}</span>
          {insignia && insignia.kind !== "none" && (
            <Insignia ins={insignia} size={20} />
          )}
          <span className="rl-rank">{title ?? "COMMAND"}</span>
          <span className="rl-sep" aria-hidden="true" />
          <span className="rl-live">
            Season 1 &middot; <b>LIVE</b>
            <span className="live-dot" aria-hidden="true" />
          </span>
        </div>
      </header>

      {!lockedSide && (
        <div className="sides" role="group" aria-label="Pick your side">
          <div
            className="side blue"
            role="button"
            tabIndex={0}
            aria-pressed={side === "blue"}
            onClick={() => pickSide("blue")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                pickSide("blue");
              }
            }}
          >
            <span className="swatch" />
            <span>Blue Team</span>
          </div>
          <div
            className="side red"
            role="button"
            tabIndex={0}
            aria-pressed={side === "red"}
            onClick={() => pickSide("red")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                pickSide("red");
              }
            }}
          >
            <span>Red Team</span>
            <span className="swatch" />
          </div>
        </div>
      )}

      <div className="board-wrap">
        <div
          className="board"
          data-side={side}
          aria-label="15 by 15 battleground"
        >
          {cells.map((c, i) => {
            const cls =
              "cell" +
              (c ? " " + c : tufts[i] ? " tuft" : "") +
              (popping.has(i) ? " pop" : "");
            return (
              <button
                key={i}
                type="button"
                className={cls}
                aria-label={`Tile ${i % N},${Math.floor(i / N)}`}
                onClick={() => onTap(i)}
              />
            );
          })}
          {won && (
            <div className="win">
              <span>
                {counts.b > counts.r ? "BLUE" : "RED"} TAKES
                <br />
                THE BOARD
                <br />
                <br />
                {pct(Math.max(counts.b, counts.r))}% control
              </span>
            </div>
          )}
        </div>
      </div>

      <div>
        <div className="meter" aria-label="Territory control">
          <i className="b" style={{ width: `${(counts.b / TOTAL) * 100}%` }} />
          <i className="n" style={{ width: `${(counts.n / TOTAL) * 100}%` }} />
          <i className="r" style={{ width: `${(counts.r / TOTAL) * 100}%` }} />
        </div>
        <div className="meter-labels">
          <span className="bl">
            <b>{counts.b}</b> BLUE
          </span>
          <span className="ol">{counts.n} OPEN</span>
          <span className="rl">
            <b>{counts.r}</b> RED
          </span>
        </div>
      </div>

      <div className="attack-head">★ CHOOSE YOUR ATTACK ★</div>
      <div className="attack-sub">{hint}</div>

      <div className="tools" role="group" aria-label="Actions">
        <div
          className="tool"
          role="button"
          tabIndex={0}
          aria-pressed={tool === "flip"}
          onClick={() => pickTool("flip")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              pickTool("flip");
            }
          }}
        >
          <span className="t-price">$1</span>
          <Crosshair />
          <span className="t-title">TAKE POSITION</span>
          <span className="t-sub">Flip 1 tile</span>
        </div>
        <div
          className="tool x"
          role="button"
          tabIndex={0}
          aria-pressed={tool === "x"}
          onClick={() => pickTool("x")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              pickTool("x");
            }
          }}
        >
          <span className="t-price">$5</span>
          <Burst />
          <span className="t-title">X-STRIKE</span>
          <span className="t-sub">5-tile strike + bonus</span>
        </div>
        {isOfficer ? (
          <div
            className="tool officer"
            role="button"
            tabIndex={0}
            aria-pressed={tool === "strike"}
            onClick={() => pickTool("strike")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                pickTool("strike");
              }
            }}
          >
            <span className="t-price">$10</span>
            <Burst />
            <span className="t-title">AIRSTRIKE</span>
            <span className="t-sub">3×3 strike</span>
          </div>
        ) : (
          <div className="tool locked" aria-disabled="true">
            <Lock />
            <span className="t-title">OFFICER COMMAND</span>
            <span className="t-sub">Commission required</span>
          </div>
        )}
      </div>

      {record ? (
        <Link href="/settings" className={"war-record " + side}>
          {insignia && insignia.kind !== "none" && (
            <span className="wr-ins">
              <Insignia ins={insignia} size={30} />
            </span>
          )}
          <span className="wr-main">
            <b>
              {side.toUpperCase()} &middot; {title}
            </b>
            <span>YOUR WAR RECORD</span>
          </span>
          <span className="wr-stats">
            {record.captures} captures &middot; {record.points} pts
          </span>
          <span className="wr-arrow" aria-hidden="true">
            ›
          </span>
        </Link>
      ) : (
        <div className="statbar">
          <span>
            Your side: <b>{side.toUpperCase()}</b>
          </span>
          <span>
            Spent: <b>${totalSpent ?? spent}</b>
          </span>
        </div>
      )}
    </div>
  );
}

const VIEWS: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/red", label: "Red" },
  { href: "/blue", label: "Blue" },
  { href: "/both", label: "Both" },
];

function startOver() {
  try {
    localStorage.removeItem("bg_player_v1");
  } catch {
    /* ignore */
  }
  window.location.href = "/";
}

export function ViewNav({ active }: { active: string }) {
  return (
    <nav className="view-nav" aria-label="Perspective">
      {VIEWS.map((v) => (
        <Link
          key={v.href}
          href={v.href}
          aria-current={v.href === active ? "page" : undefined}
        >
          {v.label}
        </Link>
      ))}
      <Link
        href="/settings"
        className="view-icon"
        aria-label="Settings"
        aria-current={active === "/settings" ? "page" : undefined}
        title="Field manual — ranks & orders"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </Link>
      <button
        type="button"
        className="view-restart"
        onClick={startOver}
        aria-label="Start over"
        title="Start over — clears your enlistment"
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <polyline points="21 3 21 9 15 9" />
        </svg>
      </button>
    </nav>
  );
}

// Shared core: read the enlisted player's rank so every view shows it the same.
export function usePlayerRank(): { insignia: InsigniaSpec; name: string } | null {
  const [rank, setRank] = useState<{ insignia: InsigniaSpec; name: string } | null>(
    null,
  );
  useEffect(() => {
    try {
      const raw = localStorage.getItem("bg_player_v1");
      if (!raw) return;
      const p = JSON.parse(raw);
      if (!p?.side) return;
      const r = rankFor({
        placedFirst: p.placedFirst ?? true,
        logins: p.logins ?? 1,
        spent: p.spent ?? 0,
        isOfficer: p.isOfficer ?? false,
      });
      setRank({ insignia: r.insignia, name: r.name.toUpperCase() });
    } catch {
      /* first visit / storage blocked */
    }
  }, []);
  return rank;
}

// A single command view that owns its own board.
export function Command({
  lockedSide,
  active,
}: {
  lockedSide?: Team;
  active: string;
}) {
  const board = useBattleground();
  const pr = usePlayerRank();
  return (
    <>
      <Announcer counts={board.counts} />
      <BoardView
        board={board}
        lockedSide={lockedSide}
        title={pr?.name}
        insignia={pr?.insignia}
      />
      <ViewNav active={active} />
    </>
  );
}

// Split view: ONE board, seen from both command centers at once.
export function BothCommand() {
  const board = useBattleground();
  const pr = usePlayerRank();
  return (
    <>
      <Announcer counts={board.counts} />
      <div className="split">
        <BoardView
          board={board}
          lockedSide="blue"
          title={pr?.name}
          insignia={pr?.insignia}
        />
        <BoardView
          board={board}
          lockedSide="red"
          title={pr?.name}
          insignia={pr?.insignia}
        />
      </div>
      <ViewNav active="/both" />
    </>
  );
}
