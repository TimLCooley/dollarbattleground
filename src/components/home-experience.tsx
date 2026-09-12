"use client";

import { useEffect, useRef, useState } from "react";
import { BoardView, useBattleground, ViewNav, type Team } from "./board";
import { Onboarding } from "./onboarding";
import { PromotionModal } from "./promotion";
import { rankFor, RANKS, type Rank } from "@/lib/ranks";

const KEY = "bg_player_v1";

interface Player {
  side: Team;
  email: string;
  logins: number; // small career-progress nudge
  spent: number; // total $ spent — the main rank driver
  isOfficer: boolean; // gated by buying a $5 action
  placedFirst: boolean; // planted first tile -> promoted to Private
  captures: number; // total tiles taken (war record)
  rankKey: string; // last acknowledged rank
}

function tilesFor(amount: number): number {
  return amount >= 10 ? 9 : amount >= 5 ? 5 : 1;
}

function orderOfKey(key: string): number {
  return RANKS.find((r) => r.key === key)?.order ?? 0;
}

export function HomeExperience() {
  const board = useBattleground();
  const [player, setPlayer] = useState<Player | null>(null);
  const [ready, setReady] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [promotionRank, setPromotionRank] = useState<Rank | null>(null);
  const firstThreat = useRef(false);

  // Returning players: count the login, advance enlisted rank, and celebrate
  // any promotion earned since last visit.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Player> & { buys?: number };
        if (p?.side) {
          const spent = p.spent ?? (p.buys ? p.buys * 5 : 0); // migrate old buys
          const next: Player = {
            side: p.side,
            email: p.email ?? "",
            logins: (p.logins ?? 1) + 1,
            spent,
            isOfficer: p.isOfficer ?? false,
            placedFirst: p.placedFirst ?? true,
            captures: p.captures ?? 0,
            rankKey: p.rankKey ?? "recruit",
          };
          const nr = rankFor(next);
          if (nr.order > orderOfKey(next.rankKey)) setPromotionRank(nr);
          next.rankKey = nr.key;
          setPlayer(next);
          localStorage.setItem(KEY, JSON.stringify(next));
        }
      }
    } catch {
      /* first visit / storage blocked */
    }
    setReady(true);
  }, []);

  function persist(p: Player) {
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
      /* ignore */
    }
  }

  function handleComplete(side: Team, email: string) {
    const p: Player = {
      side,
      email,
      logins: 1,
      spent: 0,
      isOfficer: false,
      placedFirst: false,
      captures: 0,
      rankKey: "recruit",
    };
    setPlayer(p);
    persist(p);
    setPlacing(true);
  }

  function handlePlace() {
    setPlacing(false);
    if (player && !player.placedFirst) {
      const promoted: Player = {
        ...player,
        placedFirst: true,
        captures: player.captures + 1,
      };
      const nr = rankFor(promoted);
      promoted.rankKey = nr.key;
      setPlayer(promoted);
      persist(promoted);
      firstThreat.current = true;
      setPromotionRank(nr);
    }
  }

  // Every paid action ($1/$5/$10) adds to career progress and can promote you.
  // A $5+ action also commissions you as an Officer.
  function handlePurchase(amount: number) {
    if (!player) return;
    const prev = rankFor(player);
    const next: Player = {
      ...player,
      spent: player.spent + amount,
      captures: player.captures + tilesFor(amount),
      isOfficer: player.isOfficer || amount >= 5,
    };
    const nr = rankFor(next);
    next.rankKey = nr.key;
    setPlayer(next);
    persist(next);
    if (nr.order > prev.order) setPromotionRank(nr);
  }

  function dismissPromotion() {
    setPromotionRank(null);
    if (firstThreat.current) {
      firstThreat.current = false;
      const enemy = player?.side === "red" ? "Blue" : "Red";
      flashMsg(
        `⚠ ${enemy} is already moving on your position — hold the line, Private.`,
      );
    }
  }

  function flashMsg(msg: string) {
    setFlash(msg);
    window.setTimeout(() => setFlash((cur) => (cur === msg ? null : cur)), 9000);
  }

  const rank = player ? rankFor(player) : null;
  const title = rank ? rank.name.toUpperCase() : undefined;

  return (
    <>
      <BoardView
        board={board}
        lockedSide={player?.side}
        title={title}
        insignia={rank?.insignia}
        placementMode={placing}
        onPlace={handlePlace}
        isOfficer={player?.isOfficer}
        onPurchase={handlePurchase}
        totalSpent={player?.spent}
        record={player ? { captures: player.captures } : undefined}
        flash={flash}
      />

      {placing && (
        <div className="place-banner">
          Tap any tile to plant your flag, Recruit. Your first one&apos;s on us.
        </div>
      )}

      <ViewNav active="/" />

      {ready && !player && <Onboarding onComplete={handleComplete} />}

      {promotionRank && player && (
        <PromotionModal
          rank={promotionRank}
          side={player.side}
          onClose={dismissPromotion}
        />
      )}
    </>
  );
}
