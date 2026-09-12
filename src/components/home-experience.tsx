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
  logins: number;
  spent: number; // total $ spent
  isOfficer: boolean;
  placedFirst: boolean;
  captures: number; // total positions taken
  reclaimed: number; // positions flipped from the enemy
  xStrikes: number; // $5 actions ordered
  officerActions: number; // $10 actions used
  days: number; // distinct days reported for duty
  lastLoginDay: string; // YYYY-MM-DD
  enlistedAt: string; // ISO
  lastActionAt: string | null; // ISO
  lastPromotionAt: string | null; // ISO
  rankKey: string;
}

function tilesFor(amount: number): number {
  return amount >= 10 ? 9 : amount >= 5 ? 5 : 1;
}

function orderOfKey(key: string): number {
  return RANKS.find((r) => r.key === key)?.order ?? 0;
}

const nowISO = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

export function HomeExperience() {
  const board = useBattleground();
  const [player, setPlayer] = useState<Player | null>(null);
  const [ready, setReady] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [promotionRank, setPromotionRank] = useState<Rank | null>(null);
  const firstThreat = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Player> & { buys?: number };
        if (p?.side) {
          const spent = p.spent ?? (p.buys ? p.buys * 5 : 0);
          const t = today();
          const newDay = !!p.lastLoginDay && p.lastLoginDay !== t;
          const next: Player = {
            side: p.side,
            email: p.email ?? "",
            logins: (p.logins ?? 1) + 1,
            spent,
            isOfficer: p.isOfficer ?? false,
            placedFirst: p.placedFirst ?? true,
            captures: p.captures ?? 0,
            reclaimed: p.reclaimed ?? 0,
            xStrikes: p.xStrikes ?? 0,
            officerActions: p.officerActions ?? 0,
            days: (p.days ?? 1) + (newDay ? 1 : 0),
            lastLoginDay: t,
            enlistedAt: p.enlistedAt ?? nowISO(),
            lastActionAt: p.lastActionAt ?? null,
            lastPromotionAt: p.lastPromotionAt ?? null,
            rankKey: p.rankKey ?? "recruit",
          };
          const nr = rankFor(next);
          if (nr.order > orderOfKey(next.rankKey)) {
            next.lastPromotionAt = nowISO();
            setPromotionRank(nr);
          }
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
      reclaimed: 0,
      xStrikes: 0,
      officerActions: 0,
      days: 1,
      lastLoginDay: today(),
      enlistedAt: nowISO(),
      lastActionAt: null,
      lastPromotionAt: null,
      rankKey: "recruit",
    };
    setPlayer(p);
    persist(p);
    setPlacing(true);
  }

  function handlePlace(_i: number, reclaimed: number) {
    setPlacing(false);
    if (player && !player.placedFirst) {
      const promoted: Player = {
        ...player,
        placedFirst: true,
        captures: player.captures + 1,
        reclaimed: player.reclaimed + reclaimed,
        lastActionAt: nowISO(),
        lastPromotionAt: nowISO(),
      };
      const nr = rankFor(promoted);
      promoted.rankKey = nr.key;
      setPlayer(promoted);
      persist(promoted);
      firstThreat.current = true;
      setPromotionRank(nr);
    }
  }

  function handlePurchase(amount: number, reclaimed: number) {
    if (!player) return;
    const prev = rankFor(player);
    const next: Player = {
      ...player,
      spent: player.spent + amount,
      captures: player.captures + tilesFor(amount),
      reclaimed: player.reclaimed + reclaimed,
      xStrikes: player.xStrikes + (amount === 5 ? 1 : 0),
      officerActions: player.officerActions + (amount === 10 ? 1 : 0),
      isOfficer: player.isOfficer || amount >= 5,
      lastActionAt: nowISO(),
    };
    const nr = rankFor(next);
    const promoted = nr.order > prev.order;
    if (promoted) next.lastPromotionAt = nowISO();
    next.rankKey = nr.key;
    setPlayer(next);
    persist(next);
    if (promoted) setPromotionRank(nr);
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
