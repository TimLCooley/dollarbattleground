"use client";

import { useEffect, useState } from "react";
import { BoardView, useBattleground, ViewNav, type Team } from "./board";
import { Onboarding } from "./onboarding";
import { Announcer } from "./announcer";

const KEY = "bg_player_v1";

interface Player {
  side: Team;
  name: string;
}

export function HomeExperience() {
  const board = useBattleground();
  const [player, setPlayer] = useState<Player | null>(null);
  const [ready, setReady] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [threat, setThreat] = useState<string | null>(null);

  // Returning Captains skip the funnel and go straight to their command.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw) as Player;
        if (p?.side && p?.name != null) setPlayer({ side: p.side, name: p.name });
      }
    } catch {
      /* first visit / storage blocked */
    }
    setReady(true);
  }, []);

  function handleComplete(side: Team, name: string, email: string) {
    setPlayer({ side, name });
    setPlacing(true);
    try {
      localStorage.setItem(KEY, JSON.stringify({ side, name, email }));
    } catch {
      /* ignore */
    }
  }

  function handlePlace() {
    setPlacing(false);
    const enemy = player?.side === "red" ? "Blue" : "Red";
    setThreat(
      `⚠ Captain ${player?.name ?? ""}, ${enemy} is already moving on your position — hold the line!`,
    );
    window.setTimeout(() => setThreat(null), 9000);
  }

  const title = player
    ? `CAPTAIN ${player.name.toUpperCase() || player.side.toUpperCase()}`
    : undefined;

  return (
    <>
      <Announcer counts={board.counts} playerSide={player?.side} threat={threat} />

      <BoardView
        board={board}
        lockedSide={player?.side}
        title={title}
        placementMode={placing}
        onPlace={handlePlace}
      />

      {placing && (
        <div className="place-banner">
          Tap any tile to plant your flag, Captain. Your first one&apos;s on us.
        </div>
      )}

      <ViewNav active="/" />

      {ready && !player && <Onboarding onComplete={handleComplete} />}
    </>
  );
}
