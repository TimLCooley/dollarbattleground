"use client";

import { useEffect, useState } from "react";
import { BoardView, useBattleground, ViewNav, type Team } from "./board";
import { Onboarding } from "./onboarding";
import { Announcer } from "./announcer";
import { PromotionModal } from "./promotion";

const KEY = "bg_player_v1";

interface Player {
  side: Team;
  email: string;
  logins: number;
  isOfficer: boolean;
  placedFirst: boolean; // planted their first tile -> promoted to Private
}

// Recruit is the transient "just enlisted" rank; planting your first tile
// promotes you to Private. Officers are commissioned by buying a $5 action.
// (US Army ladder — higher enlisted ranks by login count are TBD.)
function rankLabel(p: Player): string {
  if (p.isOfficer) return "LIEUTENANT";
  return p.placedFirst ? "PRIVATE" : "RECRUIT";
}

export function HomeExperience() {
  const board = useBattleground();
  const [player, setPlayer] = useState<Player | null>(null);
  const [ready, setReady] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<string | null>(null);

  // Returning recruits skip the funnel; count this login and advance rank.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Player>;
        if (p?.side) {
          const next: Player = {
            side: p.side,
            email: p.email ?? "",
            logins: (p.logins ?? 1) + 1,
            isOfficer: !!p.isOfficer,
            placedFirst: p.placedFirst ?? true, // returning => already deployed
          };
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
      isOfficer: false,
      placedFirst: false,
    };
    setPlayer(p);
    persist(p);
    setPlacing(true);
  }

  function handlePlace() {
    setPlacing(false);
    // Planting your first tile promotes Recruit -> Private (celebrated in a modal).
    if (player && !player.placedFirst) {
      const promoted: Player = { ...player, placedFirst: true };
      setPlayer(promoted);
      persist(promoted);
      setPromotion("PRIVATE");
    }
  }

  function dismissPromotion() {
    setPromotion(null);
    const enemy = player?.side === "red" ? "Blue" : "Red";
    flashMsg(
      `⚠ ${enemy} is already moving on your position — hold the line, Private.`,
    );
  }

  function handleCommission() {
    if (!player || player.isOfficer) return;
    const next: Player = { ...player, isOfficer: true };
    setPlayer(next);
    persist(next);
    flashMsg("◆ COMMISSIONED ◆ You're an Officer now — the $10 Airstrike is yours.");
  }

  function flashMsg(msg: string) {
    setFlash(msg);
    window.setTimeout(() => setFlash((cur) => (cur === msg ? null : cur)), 9000);
  }

  const title = player ? rankLabel(player) : undefined;

  return (
    <>
      <Announcer counts={board.counts} playerSide={player?.side} threat={flash} />

      <BoardView
        board={board}
        lockedSide={player?.side}
        title={title}
        placementMode={placing}
        onPlace={handlePlace}
        isOfficer={player?.isOfficer}
        onCommission={handleCommission}
      />

      {placing && (
        <div className="place-banner">
          Tap any tile to plant your flag, Recruit. Your first one&apos;s on us.
        </div>
      )}

      <ViewNav active="/" />

      {ready && !player && <Onboarding onComplete={handleComplete} />}

      {promotion && player && (
        <PromotionModal
          rank={promotion}
          side={player.side}
          onClose={dismissPromotion}
        />
      )}
    </>
  );
}
