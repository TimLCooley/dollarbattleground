"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Announcer } from "./announcer";

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

interface BoardViewProps {
  board: Battleground;
  lockedSide?: Team; // /red and /blue (and a chosen player) lock you to a faction
  title?: string; // command banner label (rank on Home)
  placementMode?: boolean; // onboarding "plant your flag" — next tap is a free claim
  onPlace?: (i: number) => void;
  isOfficer?: boolean; // unlocks the $10 officer action
  onCommission?: () => void; // fired when a $5 action is bought (enlisted -> officer)
}

export function BoardView({
  board,
  lockedSide,
  title,
  placementMode,
  onPlace,
  isOfficer,
  onCommission,
}: BoardViewProps) {
  const { cells, counts, popping, claim } = board;
  const [internalSide, setInternalSide] = useState<Team>("blue");
  const side: Team = lockedSide ?? internalSide;
  const [tool, setTool] = useState<Tool>("flip");
  const [spent, setSpent] = useState(0);
  const [hint, setHint] = useState(
    lockedSide
      ? "Hold the line — tap a tile to deploy."
      : "Tap a tile to flip it to your color.",
  );
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
      } else if (tool === "x") {
        claim(xPattern(i), side);
        setSpent((v) => v + 5);
        bonusArmed.current = true;
        setHint("X placed! Now tap any tile — your bonus flip.");
        onCommission?.(); // buying a $5 action commissions you as an Officer
      } else if (tool === "strike" && isOfficer) {
        claim(strikePattern(i), side);
        setSpent((v) => v + 10);
        setHint("Airstrike! 3×3 block seized.");
      }
    },
    [won, tool, side, claim, placementMode, onPlace, isOfficer, onCommission],
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
      {lockedSide && (
        <div className={`command-bar ${lockedSide}`}>
          ◆ {title ?? `${lockedSide.toUpperCase()} COMMAND`} ◆
        </div>
      )}

      <header className="bg-header">
        <div className="wordmark">
          <span className="coin">$</span>battleground
        </div>
        <div className="roundline">
          <span className="nav">&lsaquo; Prev</span>
          <span>
            Season 1 &middot; <b>Live</b>
          </span>
          <span className="nav">Next &rsaquo;</span>
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
        <div className="board" aria-label="15 by 15 battleground">
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
          <span className="bl">Blue {pct(counts.b)}%</span>
          <span style={{ opacity: 0.7 }}>
            {counts.n ? `— ${counts.n} open —` : "— full —"}
          </span>
          <span className="rl">Red {pct(counts.r)}%</span>
        </div>
      </div>

      <div className="hint">{hint}</div>

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
          <span className="price">$1</span>
          <span className="desc">Flip one tile</span>
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
          <span className="price">$5</span>
          <span className="desc">X-flip + bonus tile</span>
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
            <span className="price">$10</span>
            <span className="desc">Airstrike</span>
          </div>
        ) : (
          <div className="tool locked" aria-disabled="true">
            <span className="desc">Officers Only</span>
          </div>
        )}
      </div>

      <div className="statbar">
        <span>
          Your side: <b>{side.toUpperCase()}</b>
        </span>
        <span>
          Spent: <b>${spent}</b>
        </span>
      </div>
    </div>
  );
}

const VIEWS: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/red", label: "Red" },
  { href: "/blue", label: "Blue" },
  { href: "/both", label: "Both" },
];

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
    </nav>
  );
}

// A single command view that owns its own board.
export function Command({
  lockedSide,
  title,
  active,
}: {
  lockedSide?: Team;
  title?: string;
  active: string;
}) {
  const board = useBattleground();
  return (
    <>
      <Announcer counts={board.counts} playerSide={lockedSide} />
      <BoardView board={board} lockedSide={lockedSide} title={title} />
      <ViewNav active={active} />
    </>
  );
}

// Split view: ONE board, seen from both command centers at once.
export function BothCommand() {
  const board = useBattleground();
  return (
    <>
      <Announcer counts={board.counts} />
      <div className="split">
        <BoardView board={board} lockedSide="blue" title="BLUE COMMAND" />
        <BoardView board={board} lockedSide="red" title="RED COMMAND" />
      </div>
      <ViewNav active="/both" />
    </>
  );
}
