"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { FieldRadio } from "./announcer";
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

// A fresh board starts split 50/50 — no neutral tiles. Blue holds the left,
// Red the right. (Placeholder until the live DB board loads.)
function seed5050(): CellVal[] {
  const cells: CellVal[] = new Array(TOTAL);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      cells[y * N + x] = x < 7 || (x === 7 && y < 8) ? "blue" : "red";
    }
  }
  return cells;
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
  const [cells, setCells] = useState<CellVal[]>(seed5050);
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
function CrossedSwords() {
  return (
    <svg className="t-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 4 L15 15" />
      <path d="M20 4 L9 15" />
      <path d="M3 7 L6 4" />
      <path d="M21 7 L18 4" />
      <path d="M6.5 15.5 L4 18 M17.5 15.5 L20 18" />
    </svg>
  );
}

interface BoardViewProps {
  board: Battleground;
  lockedSide?: Team; // /red and /blue (and a chosen player) lock you to a faction
  title?: string; // rank/command label shown in the header
  placementMode?: boolean; // onboarding "plant your flag" — next tap is a free claim
  onPlace?: (i: number, reclaimed: number) => void;
  isOfficer?: boolean; // unlocks the $10 officer action
  onPurchase?: (amount: number, reclaimed: number) => void; // any action; reclaimed = enemy tiles flipped
  insignia?: InsigniaSpec; // rank insignia
  totalSpent?: number; // cumulative $ for the statbar (overrides local session)
  record?: { captures: number }; // your-impact stat (positions taken)
  flash?: string | null; // transient briefing (threats/promotions)
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
  flash,
}: BoardViewProps) {
  const { cells, counts, popping, claim } = board;
  const [internalSide, setInternalSide] = useState<Team>("blue");
  const side: Team = lockedSide ?? internalSide;
  const [tool, setTool] = useState<Tool>("flip");
  const [spent, setSpent] = useState(0);
  const [hint, setHint] = useState("Tap a position to take it.");
  const bonusArmed = useRef(false);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // No neutral tiles: the board is always fully red/blue. A side at 100% has
  // nothing left to take, so that side is locked out — but the OTHER side can
  // always play (flip enemy tiles back). So you're only locked when YOU hold all.
  const locked =
    (side === "blue" && counts.b === TOTAL) ||
    (side === "red" && counts.r === TOTAL);
  const pct = (v: number) => Math.round((v / TOTAL) * 100);
  const tufts = useMemo(seedTufts, []);

  // Tiles a click would take, previewed on hover (X for $5, 3×3 for $10).
  const previewSet = useMemo(() => {
    if (hoverIndex == null) return null;
    const idxs =
      tool === "x"
        ? xPattern(hoverIndex)
        : tool === "strike" && isOfficer
          ? strikePattern(hoverIndex)
          : [hoverIndex];
    return new Set(idxs);
  }, [hoverIndex, tool, isOfficer]);

  // How many of these tiles are currently the enemy's (i.e. reclaimed on flip).
  const enemyIn = (idxs: number[]) =>
    idxs.filter((k) => cells[k] && cells[k] !== side).length;

  const onTap = useCallback(
    (i: number) => {
      if (locked) return;
      if (placementMode) {
        claim([i], side); // free first tile
        onPlace?.(i, enemyIn([i]));
        return;
      }
      if (bonusArmed.current) {
        claim([i], side);
        bonusArmed.current = false;
        setHint("Bonus tile placed. ✦");
        onPurchase?.(0, enemyIn([i])); // the free bonus tile (no charge)
        return;
      }
      if (tool === "flip") {
        claim([i], side);
        setSpent((v) => v + 1);
        setHint("Flipped one tile.");
        onPurchase?.(1, enemyIn([i]));
      } else if (tool === "x") {
        const idxs = xPattern(i);
        claim(idxs, side);
        setSpent((v) => v + 5);
        bonusArmed.current = true;
        setHint("X placed! Now tap any tile — your bonus flip.");
        onPurchase?.(5, enemyIn(idxs));
      } else if (tool === "strike" && isOfficer) {
        const idxs = strikePattern(i);
        claim(idxs, side);
        setSpent((v) => v + 10);
        setHint("Airstrike! 3×3 block seized.");
        onPurchase?.(10, enemyIn(idxs));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locked, tool, side, claim, placementMode, onPlace, isOfficer, onPurchase, cells],
  );

  function pickSide(t: Team) {
    if (lockedSide) return;
    setInternalSide(t);
    setHint(`You are now on the ${t === "blue" ? "Blue" : "Red"} team.`);
  }

  function pickTool(t: Tool) {
    if (placementMode) return; // locked to the free placement
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
          <Link href="/report" className="rl-ranklink" title="Field report">
            {insignia && insignia.kind !== "none" && (
              <Insignia ins={insignia} size={18} />
            )}
            {title && <span className="rl-rank">{title}</span>}
          </Link>
          <span className="rl-sep" aria-hidden="true">
            |
          </span>
          <span className="rl-side">{side.toUpperCase()}</span>
          <span className="rl-sep" aria-hidden="true">
            |
          </span>
          <span className="rl-live">
            YOUR IMPACT &middot; <b>{record?.captures ?? 0}</b>
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
          onMouseLeave={() => setHoverIndex(null)}
        >
          {cells.map((c, i) => {
            const cls =
              "cell" +
              (c ? " " + c : tufts[i] ? " tuft" : "") +
              (popping.has(i) ? " pop" : "") +
              (previewSet?.has(i) ? " preview" : "");
            return (
              <button
                key={i}
                type="button"
                className={cls}
                aria-label={`Tile ${i % N},${Math.floor(i / N)}`}
                onClick={() => onTap(i)}
                onMouseEnter={() => setHoverIndex(i)}
              />
            );
          })}
          {locked && (
            <div className="win">
              <span>
                {side.toUpperCase()} HOLDS
                <br />
                THE BOARD
                <br />
                <br />
                100% — total control
              </span>
            </div>
          )}
        </div>
      </div>

      <FieldRadio counts={counts} side={side} rank={title} flash={flash} />

      <div className="attack-head">★ CHOOSE YOUR ATTACK ★</div>

      <div className="tools" role="group" aria-label="Actions">
        <div
          className="tool"
          role="button"
          tabIndex={0}
          aria-pressed={placementMode || tool === "flip"}
          onClick={() => pickTool("flip")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              pickTool("flip");
            }
          }}
        >
          <span className="t-price">{placementMode ? "FREE" : "$1"}</span>
          <Crosshair />
          <span className="t-title">TAKE POSITION</span>
          <span className="t-sub">Flip 1 tile</span>
        </div>
        <div
          className={"tool x" + (placementMode ? " dimmed" : "")}
          role="button"
          tabIndex={placementMode ? -1 : 0}
          aria-pressed={tool === "x"}
          onClick={() => pickTool("x")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              pickTool("x");
            }
          }}
        >
          {!isOfficer && (
            <span className="tool-badge" title="Commissions you as an Officer">
              <Insignia ins={{ kind: "bar", bars: 2, color: "gold" }} size={18} />
            </span>
          )}
          <span className="t-price">$5</span>
          <CrossedSwords />
          <span className="t-title">X-STRIKE</span>
          <span className="t-sub">5-tile strike + bonus</span>
        </div>
        {isOfficer ? (
          <div
            className={"tool officer" + (placementMode ? " dimmed" : "")}
            role="button"
            tabIndex={placementMode ? -1 : 0}
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
          <div
            className={"tool locked" + (placementMode ? " dimmed" : "")}
            aria-disabled="true"
          >
            <Lock />
            <span className="t-title">OFFICER COMMAND</span>
            <span className="t-sub">Commission required</span>
          </div>
        )}
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
interface PlayerRank {
  insignia: InsigniaSpec;
  abbr: string;
  captures: number;
}
export function usePlayerRank(): PlayerRank | null {
  const [rank, setRank] = useState<PlayerRank | null>(null);
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
      setRank({
        insignia: r.insignia,
        abbr: r.abbr,
        captures: p.captures ?? 0,
      });
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
      <BoardView
        board={board}
        lockedSide={lockedSide}
        title={pr?.abbr}
        insignia={pr?.insignia}
        record={pr ? { captures: pr.captures } : undefined}
      />
      <ViewNav active={active} />
    </>
  );
}

// Split view: ONE board, seen from both command centers at once.
export function BothCommand() {
  const board = useBattleground();
  const pr = usePlayerRank();
  const record = pr ? { captures: pr.captures } : undefined;
  return (
    <>
      <div className="split">
        <BoardView
          board={board}
          lockedSide="blue"
          title={pr?.abbr}
          insignia={pr?.insignia}
          record={record}
        />
        <BoardView
          board={board}
          lockedSide="red"
          title={pr?.abbr}
          insignia={pr?.insignia}
          record={record}
        />
      </div>
      <ViewNav active="/both" />
    </>
  );
}
