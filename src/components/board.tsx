"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { FieldRadio } from "./announcer";
import { Insignia, rankFor, type InsigniaSpec } from "@/lib/ranks";
import { addReceipt } from "@/lib/receipts";
import { SpendConfirm, type PendingSpend } from "./spend-confirm";
import { ClaimTile } from "./claim-tile";
import { xPattern, strikePattern } from "@/lib/board-patterns";
import { ScreenFx, CELE_MS, type Cele, type ScreenFxState } from "./screen-fx";
import { StrikeStage, TIER_FX, useFxSpeed, type Proj } from "@/lib/flip-fx";
import { SocialFeeds } from "./social-feed";
import { useAdminFreePlay } from "./use-admin-freeplay";

const N = 15;
const TOTAL = N * N;

export type Team = "red" | "blue";
type CellVal = Team | null;
type Tool = "flip" | "x" | "strike";

// Admin free paint (Free Play / god-mode): server-authoritative, admin-gated.
export function postAdminPaint(center: number, kind: Tool, team: Team) {
  fetch("/api/admin/paint", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ center, kind, team }),
  }).then((r) => {
    if (!r.ok) r.json().then((j) => console.error("admin paint failed:", j)).catch(() => {});
  });
}

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
  owned: Set<number>; // tiles the current player currently holds
  // Only the one free first tile is client-initiated (server enforces one per
  // user). Paid flips are painted server-side after Stripe confirms payment, so
  // there is no client-side paint for them — the board updates via realtime.
  claimFree: (index: number, team: Team) => void;
}

// Live board backed by the shared Supabase `tiles` table: loads the current
// board, streams realtime changes, and persists flips through claim_tiles.
// Every view that calls this reads the same board, so all screens stay in sync.
export function useBattleground(): Battleground {
  const supabase = useMemo(() => createClient(), []);
  const [cells, setCells] = useState<CellVal[]>(seed5050);
  const [popping, setPopping] = useState<Set<number>>(new Set());
  const [owned, setOwned] = useState<Set<number>>(new Set());
  const myIdRef = useRef<string | null>(null);

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

  // Initial load of the whole board + which tiles are mine.
  useEffect(() => {
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const uid = user?.id ?? null;
      myIdRef.current = uid;
      const { data, error } = await supabase
        .from("tiles")
        .select("x,y,team,owner_id");
      if (!active || error || !data) return;
      const nextCells: CellVal[] = new Array(TOTAL).fill(null);
      const nextOwned = new Set<number>();
      for (const r of data as {
        x: number;
        y: number;
        team: CellVal;
        owner_id: string | null;
      }[]) {
        const i = r.y * N + r.x;
        nextCells[i] = r.team;
        if (uid && r.owner_id === uid) nextOwned.add(i);
      }
      setCells(nextCells);
      setOwned(nextOwned);
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  // Realtime: apply every tile change from any player.
  useEffect(() => {
    const channel = supabase
      .channel(`tiles-live-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tiles" },
        (payload) => {
          const r = payload.new as {
            x: number;
            y: number;
            team: CellVal;
            owner_id: string | null;
          };
          if (r?.x == null || r?.y == null) return;
          const i = r.y * N + r.x;
          setCells((prev) => {
            if (prev[i] === r.team) return prev;
            const next = [...prev];
            next[i] = r.team;
            return next;
          });
          setOwned((prev) => {
            const mine = !!myIdRef.current && r.owner_id === myIdRef.current;
            if (mine === prev.has(i)) return prev;
            const s = new Set(prev);
            if (mine) s.add(i);
            else s.delete(i);
            return s;
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

  // The one free first tile. Server enforces one-per-user (claim_free_tile);
  // optimistic paint for instant feedback, realtime confirms it.
  const claimFree = useCallback(
    (index: number, team: Team) => {
      setCells((prev) => {
        const next = [...prev];
        next[index] = team;
        return next;
      });
      setOwned((prev) => new Set(prev).add(index));
      pop([index]);
      // Fresh client so we use the session the OTP verify just established.
      createClient()
        .rpc("claim_free_tile", {
          p_x: index % N,
          p_y: Math.floor(index / N),
          p_team: team,
        })
        .then(({ error }) => {
          if (error) console.error("claim_free_tile failed:", error.message);
        });
    },
    [pop],
  );

  return { cells, counts, popping, claimFree, owned };
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
  onPlace?: (
    i: number,
    reclaimed: number,
    email: string,
    optIn: boolean,
  ) => void;
  isOfficer?: boolean; // unlocks the $10 officer action
  // Any action (paid or a banked/free-piece placement). reclaimed = enemy tiles
  // flipped; captures = ALL tiles taken (enemy + neutral) = rank points ÷ 3.
  // Banked placements pass amount 0 so they add captures without charging.
  onPurchase?: (amount: number, reclaimed: number, captures: number) => void;
  insignia?: InsigniaSpec; // rank insignia
  totalSpent?: number; // cumulative $ for the statbar (overrides local session)
  record?: { captures: number }; // your-impact stat (positions taken)
  flash?: string | null; // transient briefing (threats/promotions)
  adminPaint?: (center: number, kind: Tool, team: Team) => void; // admin god-mode: paint free
}

function HeaderMenu() {
  const [open, setOpen] = useState(false);
  const { isAdmin, flagOn, toggle } = useAdminFreePlay();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="hmenu" ref={ref}>
      <button
        type="button"
        className="hmenu-btn"
        aria-label="Menu"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="hmenu-bars" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
      {open && (
        <nav className="hmenu-pop" aria-label="Main menu">
          <Link href="/report" className="hmenu-item" onClick={() => setOpen(false)}>
            Field Report
          </Link>
          <Link href="/settings" className="hmenu-item" onClick={() => setOpen(false)}>
            Settings
          </Link>
          {isAdmin && (
            <>
              <button
                type="button"
                className="hmenu-item hmenu-admin"
                onClick={() => toggle()}
              >
                ★ Free Play (skip purchases): {flagOn ? "ON" : "OFF"}
              </button>
              <Link
                href="/admin"
                className="hmenu-item hmenu-admin"
                onClick={() => setOpen(false)}
              >
                ★ Command
              </Link>
            </>
          )}
        </nav>
      )}
    </div>
  );
}

// The signed-in player's server-side bank of banked bonus pieces, kept live.
function useFlipBank(active: boolean) {
  const [bank, setBank] = useState<{ singles: number; blocks: number }>({
    singles: 0,
    blocks: 0,
  });
  useEffect(() => {
    if (!active) return;
    const supabase = createClient();
    let alive = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !alive) return;
      const { data } = await supabase
        .from("flip_bank")
        .select("singles,blocks")
        .eq("user_id", user.id)
        .maybeSingle();
      if (alive && data) {
        setBank({ singles: data.singles ?? 0, blocks: data.blocks ?? 0 });
      }
      channel = supabase
        .channel(`flip-bank-${user.id}-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "flip_bank",
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            const r = payload.new as { singles?: number; blocks?: number } | null;
            setBank({ singles: r?.singles ?? 0, blocks: r?.blocks ?? 0 });
          },
        )
        .subscribe();
    })();
    return () => {
      alive = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [active]);
  return bank;
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
  adminPaint,
}: BoardViewProps) {
  const { cells, counts, popping, claimFree, owned } = board;
  const [internalSide, setInternalSide] = useState<Team>("blue");
  const side: Team = lockedSide ?? internalSide;
  const [tool, setTool] = useState<Tool>("flip");
  const [spent, setSpent] = useState(0);
  const [hint, setHint] = useState("Tap a position to take it.");
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  // The tile the player has "aimed" (first tap): shows the preview + a confirm
  // bar. A second tap on it (or the bar's Confirm) commits. Mobile-friendly and
  // mirrors the desktop hover preview.
  const [aim, setAim] = useState<number | null>(null);
  // A paid order awaiting the player's explicit confirm (nothing is charged or
  // flipped until they authorize it). idxs carries the exact tiles to seize.
  const [pending, setPending] = useState<PendingSpend | null>(null);
  // The free first-tile the recruit tapped, awaiting the email claim step.
  const [pendingPlace, setPendingPlace] = useState<number | null>(null);
  // Banked bonus placements from a purchase (the "no-waste" pieces): free 2×2
  // blocks and single tiles the player still gets to place. Drives the FREE tool
  // labels + placement flow. (God-mode paints them via the admin route today;
  // the paid flow will bank them server-side next.)
  const [bank, setBank] = useState<{ singles: number; blocks: number }>({
    singles: 0,
    blocks: 0,
  });
  // Real (paid) players get their bank from the server; god-mode uses the local
  // demo bank above. effBank is whichever applies to this view.
  const serverBank = useFlipBank(!adminPaint);
  const effBank = adminPaint ? bank : serverBank;

  // reacts only to bank changes (grant / consume), so a manual cancel isn't
  // instantly overridden — see the auto-aim effect below.
  const lastBankKey = useRef("");
  // Transient flip animation: cells mid-flip + a shockwave from the last hit.
  const [flipping, setFlipping] = useState<Set<number>>(new Set());
  const [blast, setBlast] = useState<{ id: number; center: number } | null>(null);
  const blastId = useRef(0);
  // Incoming missiles for a 2×2 / 3×3 strike — fly in, THEN the impact fires.
  const [strike, setStrike] = useState<{
    id: number;
    center: number;
    proj: Proj;
    impactMs: number;
    onImpact: () => void;
  } | null>(null);
  const strikeId = useRef(0);
  const fxSpeed = useFxSpeed();
  const boardRef = useRef<HTMLDivElement>(null);
  // Full-screen celebration (shockwave for $5/$10, fireworks for $1), fired from
  // the tapped tile's screen position.
  const [screenFx, setScreenFx] = useState<ScreenFxState | null>(null);
  const screenFxId = useRef(0);
  const screenFxTimer = useRef<number | null>(null);

  // How many cells in a pattern I already hold — those "wasted" tiles convert to
  // banked singles instead (the overlap / no-waste rule).
  const ownIn = (idxs: number[]) => idxs.filter((k) => cells[k] === side).length;

  const fireScreenFx = useCallback(
    (center: number, kind: Tool) => {
      const el = boardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = center % N;
      const cy = Math.floor(center / N);
      const x = rect.left + ((cx + 0.5) / N) * rect.width;
      const y = rect.top + ((cy + 0.5) / N) * rect.height;
      const cele: Cele = kind === "flip" ? "fireworks" : "wave";
      const color = side === "red" ? "var(--red)" : "var(--blue)";
      const id = ++screenFxId.current;
      setScreenFx({ id, type: cele, color, x, y });
      if (screenFxTimer.current) clearTimeout(screenFxTimer.current);
      screenFxTimer.current = window.setTimeout(
        () => setScreenFx((s) => (s && s.id === id ? null : s)),
        CELE_MS[cele],
      );
    },
    [side],
  );

  const animateHit = useCallback(
    (idxs: number[], center: number, kind: Tool) => {
      setFlipping((prev) => new Set([...prev, ...idxs]));
      window.setTimeout(() => {
        setFlipping((prev) => {
          const s = new Set(prev);
          idxs.forEach((k) => s.delete(k));
          return s;
        });
      }, 280);
      const id = ++blastId.current;
      setBlast({ id, center });
      window.setTimeout(() => setBlast((b) => (b && b.id === id ? null : b)), 620);
      fireScreenFx(center, kind);
    },
    [fireScreenFx],
  );

  // No neutral tiles: the board is always fully red/blue. A side at 100% has
  // nothing left to take, so that side is locked out — but the OTHER side can
  // always play (flip enemy tiles back). So you're only locked when YOU hold all.
  const locked =
    (side === "blue" && counts.b === TOTAL) ||
    (side === "red" && counts.r === TOTAL);
  const pct = (v: number) => Math.round((v / TOTAL) * 100);
  const tufts = useMemo(seedTufts, []);

  // Tiles a click would take, previewed on hover (X for $5, 3×3 for $10).
  // The exact tiles the current tool would take from a focus tile — but NOT
  // tiles already yours (you can't take your own color).
  const patternFor = useCallback(
    (kind: Tool, c: number) =>
      kind === "x" ? xPattern(c) : kind === "strike" && isOfficer ? strikePattern(c) : [c],
    [isOfficer],
  );
  const targetsAt = useCallback(
    (focus: number) => patternFor(tool, focus).filter((k) => cells[k] !== side),
    [patternFor, tool, cells, side],
  );

  // Best spot for a given piece: the center that flips the MOST enemy tiles,
  // tie-broken toward the board center. Used to auto-place banked/free pieces.
  const bestAim = useCallback(
    (kind: Tool): number | null => {
      let best: number | null = null;
      let bestScore = 0;
      let bestDist = Infinity;
      for (let i = 0; i < TOTAL; i++) {
        const score = patternFor(kind, i).filter((k) => cells[k] !== side).length;
        if (score <= 0) continue;
        const dist = Math.abs((i % N) - 7) + Math.abs(Math.floor(i / N) - 7);
        if (score > bestScore || (score === bestScore && dist < bestDist)) {
          best = i;
          bestScore = score;
          bestDist = dist;
        }
      }
      return best;
    },
    [patternFor, cells, side],
  );

  const previewSet = useMemo(() => {
    const focus = aim ?? hoverIndex;
    if (focus == null) return null;
    return new Set(targetsAt(focus));
  }, [aim, hoverIndex, targetsAt]);

  // Auto-arm + auto-aim banked/free pieces: biggest first (2×2 → single),
  // pre-placed on the best spot so the player instantly sees there's something
  // to do. Fires only when the bank changes, so a manual ✕ isn't re-forced.
  useEffect(() => {
    const key = `${effBank.blocks}:${effBank.singles}`;
    if (key === lastBankKey.current) return;
    lastBankKey.current = key;
    if (aim != null || placementMode) return;
    const kind: Tool | null =
      effBank.blocks > 0 ? "x" : effBank.singles > 0 ? "flip" : null;
    if (!kind) return;
    setTool(kind);
    const spot = bestAim(kind);
    if (spot != null) setAim(spot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effBank.blocks, effBank.singles, bestAim, placementMode]);

  // How many of these tiles are currently the enemy's (i.e. reclaimed on flip).
  const enemyIn = (idxs: number[]) =>
    idxs.filter((k) => cells[k] && cells[k] !== side).length;

  // Run an action's visuals. A single tile is instant (feels great as-is). A 2×2
  // or 3×3 fires incoming MISSILES first (staggered), and only lands the impact
  // (flip pop + fireball + shockwave) + the paint when they hit — space to breathe.
  const runStrike = useCallback(
    (center: number, kind: Tool, paint: () => void) => {
      const idxs = patternFor(kind, center);
      // The tier's effect (and whether it uses a projectile) is defined once in
      // flip-fx.ts — the same source the Flip Lab renders from.
      const cfg = kind === "x" ? TIER_FX["$5"] : kind === "strike" ? TIER_FX["$10"] : TIER_FX["$1"];
      if (!cfg.proj) {
        animateHit(idxs, center, kind);
        paint();
        return;
      }
      const sid = ++strikeId.current;
      setStrike({
        id: sid,
        center,
        proj: cfg.proj,
        impactMs: cfg.impactMs,
        onImpact: () => {
          animateHit(idxs, center, kind);
          paint();
        },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patternFor, animateHit],
  );

  const commitAt = useCallback(
    (i: number) => {
      // God-mode: paint free + run the real bundle math (2×2 = +2 singles,
      // 3×3 = +1 block +1 single, plus overlap → banked singles).
      if (adminPaint) {
        if (tool === "flip") {
          runStrike(i, "flip", () => {
            adminPaint(i, "flip", side);
            if (bank.singles > 0) setBank((b) => ({ ...b, singles: b.singles - 1 }));
          });
        } else if (tool === "x") {
          const overlap = ownIn(xPattern(i));
          runStrike(i, "x", () => {
            adminPaint(i, "x", side);
            setBank((b) =>
              b.blocks > 0
                ? { singles: b.singles + overlap, blocks: b.blocks - 1 } // placing a banked block
                : { ...b, singles: b.singles + 2 + overlap }, // new $5 buy
            );
          });
        } else if (tool === "strike") {
          const overlap = ownIn(strikePattern(i));
          runStrike(i, "strike", () => {
            adminPaint(i, "strike", side);
            setBank((b) => ({ singles: b.singles + 1 + overlap, blocks: b.blocks + 1 }));
          });
        }
        return;
      }
      if (locked) return;
      if (placementMode) {
        // Don't claim yet — the recruit confirms the tile with the email
        // claim step, and only then does it flip.
        setPendingPlace(i);
        return;
      }
      // Spend a banked FREE piece instead of charging. Server-authoritative:
      // claim_banked checks the bank + derives the cells, realtime updates both.
      if (tool === "flip" && serverBank.singles > 0) {
        const took = cells[i] !== side ? 1 : 0; // 0 only if you tapped your own tile
        runStrike(i, "flip", () => {
          createClient()
            .rpc("claim_banked", { p_center: i, p_kind: "flip", p_team: side })
            .then(({ error }) => {
              if (error) console.error("claim_banked:", error.message);
            });
        });
        onPurchase?.(0, cells[i] ? took : 0, took); // banked single: no charge, +points
        return;
      }
      if (tool === "x" && serverBank.blocks > 0) {
        const flipped = patternFor("x", i).filter((k) => cells[k] !== side);
        runStrike(i, "x", () => {
          createClient()
            .rpc("claim_banked", { p_center: i, p_kind: "x", p_team: side })
            .then(({ error }) => {
              if (error) console.error("claim_banked:", error.message);
            });
        });
        onPurchase?.(0, flipped.filter((k) => cells[k]).length, flipped.length);
        return;
      }
      // Paid orders don't fire on the tap — they open a confirmation first.
      // The server derives the exact cells from this center tile.
      if (tool === "flip") {
        setPending({ kind: "flip", amount: 1, tiles: 1, side, center: i });
      } else if (tool === "x") {
        setPending({
          kind: "x",
          amount: 5,
          tiles: xPattern(i).length,
          side,
          center: i,
        });
      } else if (tool === "strike" && isOfficer) {
        setPending({
          kind: "strike",
          amount: 10,
          tiles: strikePattern(i).length,
          side,
          center: i,
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locked, tool, side, placementMode, onPlace, isOfficer, onPurchase, cells, adminPaint, bank, serverBank, runStrike],
  );

  // First tap aims (shows the preview); tapping the aimed tile again — or the
  // confirm bar — commits. Tapping a different tile moves the aim.
  const onTap = useCallback(
    (i: number) => {
      if (locked) return;
      // Nothing to take if every tile in range is already yours.
      if (targetsAt(i).length === 0) return;
      if (aim === i) {
        commitAt(i);
        setAim(null);
      } else {
        setAim(i);
      }
    },
    [locked, aim, commitAt, targetsAt],
  );
  const confirmAim = useCallback(() => {
    if (aim == null) return;
    commitAt(aim);
    setAim(null);
  }, [aim, commitAt]);

  // Payment already succeeded (server-side) by the time this runs — the flip is
  // painted server-side via the finalize route / webhook and arrives over
  // realtime. Here we just update the local UI stats + receipt cache.
  const confirmSpend = useCallback(() => {
    const p = pending;
    if (!p) return;
    // Missiles fly in (2×2/3×3), then the impact lands; paint is server-side.
    runStrike(p.center, p.kind, () => {});
    setSpent((v) => v + p.amount);
    setHint(
      p.kind === "flip"
        ? "Position taken."
        : p.kind === "x"
          ? "2×2 block seized."
          : "3×3 block seized.",
    );
    // Credit only the tiles that actually flip now; own-tile overlap gets banked
    // and earns its points when you place it later (a banked single).
    const flipped = patternFor(p.kind, p.center).filter((k) => cells[k] !== side);
    onPurchase?.(p.amount, flipped.filter((k) => cells[k]).length, flipped.length);
    addReceipt({ amount: p.amount, kind: p.kind, tiles: p.tiles, side });
    setPending(null);
  }, [pending, side, onPurchase, runStrike, cells, patternFor]);

  // The recruit gave their email and claimed the free first tile.
  const confirmPlace = useCallback(
    (email: string, optIn: boolean) => {
      const i = pendingPlace;
      if (i == null) return;
      claimFree(i, side);
      onPlace?.(i, enemyIn([i]), email, optIn);
      setPendingPlace(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingPlace, side, claimFree, onPlace, cells],
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
    setHint(
      t === "flip"
        ? "Tap a tile to flip it — $1."
        : t === "x"
          ? "Tap to seize a 2×2 block — $5."
          : "Barrage armed — tap to seize a 3×3 block — $10.",
    );
  }

  return (
    <div className={"cartridge" + (lockedSide ? ` ${lockedSide}-cmd` : "")}>
      <header className="bg-header">
        <HeaderMenu />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="wordmark-logo"
          src={`/logo-${side}.png`}
          alt="Battleground"
        />
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

      {adminPaint && (
        <div className="god-mode">
          ★ FREE PLAY (admin) · purchases off · tap to paint free ★
        </div>
      )}

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
          ref={boardRef}
          className="board"
          data-side={side}
          data-skin="plate"
          aria-label="15 by 15 battleground"
          onMouseLeave={() => setHoverIndex(null)}
        >
          {cells.map((c, i) => {
            const cls =
              "cell" +
              (c ? " " + c : tufts[i] ? " tuft" : "") +
              (owned.has(i) ? " mine" : "") +
              (popping.has(i) ? " pop" : "") +
              (flipping.has(i) ? " flip" : "") +
              (previewSet?.has(i) ? " preview" : "") +
              (aim === i ? " aimed" : "");
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
          {blast && (
            <div
              className="board-blast"
              style={{
                left: `${(((blast.center % N) + 0.5) / N) * 100}%`,
                top: `${((Math.floor(blast.center / N) + 0.5) / N) * 100}%`,
              }}
            />
          )}
          {strike && (
            <div
              key={strike.id}
              className="board-fxstage"
              style={
                {
                  left: `${(((strike.center % N) + 0.5) / N) * 100}%`,
                  top: `${((Math.floor(strike.center / N) + 0.5) / N) * 100}%`,
                  "--fxspeed": fxSpeed,
                } as React.CSSProperties
              }
            >
              <StrikeStage
                proj={strike.proj}
                side={side}
                impactMs={strike.impactMs}
                speed={fxSpeed}
                onImpact={strike.onImpact}
                onDone={() => setStrike((s) => (s && s.id === strike.id ? null : s))}
              />
            </div>
          )}
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

      {(effBank.singles > 0 || effBank.blocks > 0) && (
        <div className="bank-tray" role="status">
          <span className="bank-tray-title">🎁 FREE TO PLACE</span>
          <span className="bank-tray-items">
            {effBank.blocks > 0 && (
              <span className="bank-chip">
                <span className="chip-ico chip-block" aria-hidden="true" /> 2×2 block ×{effBank.blocks}
              </span>
            )}
            {effBank.singles > 0 && (
              <span className="bank-chip">
                <span className="chip-ico chip-single" aria-hidden="true" /> tile ×{effBank.singles}
              </span>
            )}
          </span>
          <span className="bank-tray-why">from your purchase — tap the board to place</span>
        </div>
      )}

      {aim != null &&
        (() => {
          const fs = effBank.singles;
          const fb = effBank.blocks;
          let title = "Confirm";
          let cost = "";
          if (placementMode) {
            title = "Plant your flag here";
            cost = "FREE";
          } else if (tool === "flip") {
            title = fs > 0 ? "Place free tile" : "Take this position";
            cost = fs > 0 ? `FREE · ${fs} left` : "$1";
          } else if (tool === "x") {
            title = fb > 0 ? "Place free 2×2" : "2×2 strike here";
            cost = fb > 0 ? `FREE · ${fb} left` : "$5";
          } else if (tool === "strike") {
            title = "3×3 barrage here";
            cost = "$10";
          }
          // Free Play / god-mode: no charge.
          if (adminPaint && !cost.startsWith("FREE")) cost = "FREE (admin)";
          const enemy = previewSet ? enemyIn([...previewSet]) : 0;
          return (
            <div className="aim-bar">
              <div className="aim-info">
                <span className="aim-title">{title}</span>
                <span className="aim-meta">
                  <span className={"aim-cost" + (cost.startsWith("FREE") ? " free" : "")}>
                    {cost}
                  </span>
                  {enemy > 0 && <span className="aim-enemy">flips {enemy} enemy</span>}
                </span>
              </div>
              <div className="aim-actions">
                <button
                  className="aim-cancel"
                  type="button"
                  onClick={() => setAim(null)}
                  aria-label="Cancel"
                >
                  ✕
                </button>
                <button className="aim-confirm" type="button" onClick={confirmAim}>
                  Confirm ✓
                </button>
              </div>
            </div>
          );
        })()}

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
          <span className={"t-price" + (effBank.singles > 0 ? " free" : "")}>
            {effBank.singles > 0 ? `FREE ×${effBank.singles}` : placementMode ? "FREE" : "$1"}
          </span>
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
          <span className={"t-price" + (effBank.blocks > 0 ? " free" : "")}>
            {effBank.blocks > 0 ? `FREE ×${effBank.blocks}` : "$5"}
          </span>
          <CrossedSwords />
          <span className="t-title">2×2 STRIKE</span>
          <span className="t-sub">Seize a 2×2 block</span>
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
            <span className="t-title">3×3 BARRAGE</span>
            <span className="t-sub">Seize a 3×3 block</span>
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


      {pending && (
        <SpendConfirm
          pending={pending}
          onConfirm={confirmSpend}
          onCancel={() => setPending(null)}
        />
      )}

      {pendingPlace != null && (
        <ClaimTile
          side={side}
          onConfirm={confirmPlace}
          onReselect={() => setPendingPlace(null)}
        />
      )}

      <ScreenFx fx={screenFx} />
    </div>
  );
}

const VIEWS: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/red", label: "Red" },
  { href: "/blue", label: "Blue" },
  { href: "/both", label: "Both" },
  { href: "/admin", label: "Admin" },
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
  // Perspective switcher + refresh are admin-only tools; hidden for players.
  const { isAdmin } = useAdminFreePlay();
  if (!isAdmin) return null;
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
        captures: p.captures ?? 0,
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
  const { freePlay } = useAdminFreePlay();
  return (
    <>
      <BoardView
        board={board}
        lockedSide={lockedSide}
        isOfficer={freePlay || undefined}
        adminPaint={freePlay ? postAdminPaint : undefined}
        title={pr?.abbr}
        insignia={pr?.insignia}
        record={pr ? { captures: pr.captures } : undefined}
      />
      <ViewNav active={active} />
    </>
  );
}

// Admin Free Play god-mode: one unlocked board, all weapons, paint either side free.
function AdminCommand() {
  const board = useBattleground();
  const pr = usePlayerRank();
  return (
    <>
      <BoardView
        board={board}
        isOfficer
        adminPaint={postAdminPaint}
        title={pr?.abbr}
        insignia={pr?.insignia}
        record={pr ? { captures: pr.captures } : undefined}
      />
      <SocialFeeds />
      <ViewNav active="/both" />
    </>
  );
}

// Split view: ONE board, seen from both command centers at once. Admins with
// Free Play on get the full-access god-mode board instead.
export function BothCommand() {
  const board = useBattleground();
  const pr = usePlayerRank();
  const { freePlay, isAdmin } = useAdminFreePlay();
  const record = pr ? { captures: pr.captures } : undefined;

  if (freePlay) return <AdminCommand />;

  return (
    <>
      <div className="split">
        <BoardView
          board={board}
          lockedSide="blue"
          isOfficer={isAdmin || undefined}
          title={pr?.abbr}
          insignia={pr?.insignia}
          record={record}
        />
        <BoardView
          board={board}
          lockedSide="red"
          isOfficer={isAdmin || undefined}
          title={pr?.abbr}
          insignia={pr?.insignia}
          record={record}
        />
      </div>
      <SocialFeeds />
      <ViewNav active="/both" />
    </>
  );
}
