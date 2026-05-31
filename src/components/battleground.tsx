"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { NewsFeed, type FeedItem } from "@/components/news-feed";

export type Faction = { key: string; name: string; color: string };
export type Cell = { x: number; y: number; faction_key: string | null };

const GRID = 10;

function key(x: number, y: number): string {
  return `${x},${y}`;
}

async function fetchBalance(
  supabase: ReturnType<typeof createClient>,
): Promise<number | null> {
  const { data } = await supabase
    .from("wallets")
    .select("balance_credits")
    .maybeSingle();
  return data?.balance_credits ?? null;
}

export function Battleground({
  factions,
  initialCells,
  initialFeed,
  initialBalance,
}: {
  factions: Faction[];
  initialCells: Cell[];
  initialFeed: FeedItem[];
  initialBalance: number | null;
}) {
  const supabase = useMemo(() => createClient(), []);

  const colorOf = useMemo(() => {
    const m = new Map(factions.map((f) => [f.key, f.color]));
    return (k: string | null) => (k ? (m.get(k) ?? null) : null);
  }, [factions]);

  const [cells, setCells] = useState<Map<string, string | null>>(() => {
    const m = new Map<string, string | null>();
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) m.set(key(x, y), null);
    }
    for (const c of initialCells) m.set(key(c.x, c.y), c.faction_key);
    return m;
  });
  const [feed, setFeed] = useState<FeedItem[]>(initialFeed);
  const [balance, setBalance] = useState<number | null>(initialBalance);
  const [myFaction, setMyFaction] = useState<string>(
    factions[0]?.key ?? "democrat",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBalance(supabase).then((b) => {
      if (b !== null) setBalance(b);
    });

    const channel = supabase
      .channel("battleground")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "cells" },
        (payload) => {
          const c = payload.new as Cell;
          setCells((prev) => new Map(prev).set(key(c.x, c.y), c.faction_key));
        },
      )
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

  async function claimSquare(x: number, y: number) {
    setError(null);
    const { error: rpcError } = await supabase.rpc("claim_cell", {
      p_x: x,
      p_y: y,
      p_faction_key: myFaction,
    });
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    const b = await fetchBalance(supabase);
    if (b !== null) setBalance(b);
  }

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
            const color = colorOf(cells.get(key(x, y)) ?? null);
            return (
              <button
                key={i}
                type="button"
                aria-label={`Grid ${x}-${y}`}
                onClick={() => claimSquare(x, y)}
                style={color ? { backgroundColor: color } : undefined}
                className="h-11 w-11 cursor-pointer border border-neutral-300 transition-colors hover:border-neutral-500"
              />
            );
          })}
        </div>

        <Hud
          factions={factions}
          selected={myFaction}
          onSelect={setMyFaction}
          balance={balance}
          error={error}
        />
      </main>

      <NewsFeed items={feed} />
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
