"use client";

import { useEffect, useRef, useState } from "react";
import { BoardView, useBattleground, ViewNav, type Team } from "./board";
import { Onboarding } from "./onboarding";
import { Announcer } from "./announcer";
import { PromotionModal } from "./promotion";
import { rankFor, RANKS, type Rank } from "@/lib/ranks";

const KEY = "bg_player_v1";

interface Player {
  side: Team;
  email: string;
  logins: number; // enlisted ranks climb with this
  buys: number; // officer ranks climb with this ($5/$10 actions)
  isOfficer: boolean;
  placedFirst: boolean; // planted first tile -> promoted to Private
  rankKey: string; // last acknowledged rank
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
        const p = JSON.parse(raw) as Partial<Player>;
        if (p?.side) {
          const buys = p.buys ?? 0;
          const next: Player = {
            side: p.side,
            email: p.email ?? "",
            logins: (p.logins ?? 1) + 1,
            buys,
            isOfficer: p.isOfficer ?? buys > 0,
            placedFirst: p.placedFirst ?? true,
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
      buys: 0,
      isOfficer: false,
      placedFirst: false,
      rankKey: "recruit",
    };
    setPlayer(p);
    persist(p);
    setPlacing(true);
  }

  function handlePlace() {
    setPlacing(false);
    if (player && !player.placedFirst) {
      const promoted: Player = { ...player, placedFirst: true };
      const nr = rankFor(promoted);
      promoted.rankKey = nr.key;
      setPlayer(promoted);
      persist(promoted);
      firstThreat.current = true;
      setPromotionRank(nr);
    }
  }

  // Buying a $5/$10 action commissions you and climbs the officer ladder.
  function handlePurchase() {
    if (!player) return;
    const prev = rankFor(player);
    const next: Player = { ...player, buys: player.buys + 1, isOfficer: true };
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

  return (
    <>
      <Announcer counts={board.counts} playerSide={player?.side} threat={flash} />

      <BoardView
        board={board}
        lockedSide={player?.side}
        title={rank?.name.toUpperCase()}
        insignia={rank?.insignia}
        placementMode={placing}
        onPlace={handlePlace}
        isOfficer={player?.isOfficer}
        onPurchase={handlePurchase}
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
