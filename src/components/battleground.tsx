"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { NewsFeed, type FeedItem } from "@/components/news-feed";
import { BreachToasts } from "@/components/breach-toasts";
import { GRID, useBoard } from "@/hooks/use-board";
import type { Faction, CellRow } from "@/hooks/use-board";

export type { Faction } from "@/hooks/use-board";
export type Cell = CellRow;

export function Battleground({
  factions,
  initialCells,
  initialFeed,
  initialBalance,
}: {
  factions: Faction[];
  initialCells: CellRow[];
  initialFeed: FeedItem[];
  initialBalance: number | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const board = useBoard(supabase, {
    factions,
    cells: initialCells,
    balance: initialBalance,
  });

  const [feed, setFeed] = useState<FeedItem[]>(initialFeed);
  useEffect(() => {
    const channel = supabase
      .channel(`feed-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "feed" },
        (payload) => {
          setFeed((prev) => [payload.new as FeedItem, ...prev].slice(0, 50));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return (
    <div className="flex h-screen overflow-hidden bg-white text-neutral-900">
      <main className="relative flex flex-1 items-center justify-center overflow-auto p-8">
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${GRID}, 2.75rem)` }}
        >
          {Array.from({ length: GRID * GRID }).map((_, i) => {
            const x = i % GRID;
            const y = Math.floor(i / GRID);
            const color = board.colorAt(x, y);
            return (
              <button
                key={i}
                type="button"
                aria-label={`Grid ${x}-${y}`}
                onClick={() => board.claim(x, y)}
                style={color ? { backgroundColor: color } : undefined}
                className="h-11 w-11 cursor-pointer border border-neutral-300 transition-colors hover:border-neutral-500"
              />
            );
          })}
        </div>

        <Hud
          factions={board.factions}
          selected={board.myFaction}
          onSelect={board.setMyFaction}
          balance={board.balance}
          error={board.error}
        />
      </main>

      <NewsFeed items={feed} />

      <BreachToasts
        breaches={board.breaches}
        factionName={board.factionName}
        colorOf={board.colorOf}
        onRetaliate={board.retaliate}
        onDismiss={board.dismissBreach}
      />
    </div>
  );
}

function Hud({
  factions,
  selected,
  onSelect,
  balance,
  error,
}: {
  factions: Faction[];
  selected: string;
  onSelect: (key: string) => void;
  balance: number | null;
  error: string | null;
}) {
  return (
    <div className="fixed bottom-6 left-24 flex flex-col gap-2">
      {error && (
        <span className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white">
          {error}
        </span>
      )}
      <div className="flex items-center gap-3 rounded-full border border-neutral-200 bg-white px-3 py-2 shadow-sm">
        {factions.map((f) => {
          const isSelected = f.key === selected;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => onSelect(f.key)}
              aria-label={f.name}
              aria-pressed={isSelected}
              title={f.name}
              className={`h-7 w-7 rounded-full transition ${
                isSelected
                  ? "ring-2 ring-neutral-800 ring-offset-2"
                  : "opacity-60 hover:opacity-100"
              }`}
              style={{ backgroundColor: f.color }}
            />
          );
        })}
        <span className="border-l border-neutral-200 pl-3 font-mono text-xs text-neutral-600">
          {balance ?? "—"} cr
        </span>
      </div>
    </div>
  );
}
