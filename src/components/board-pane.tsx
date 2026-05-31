"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";

type Faction = { key: string; name: string; color: string };
type Cell = { x: number; y: number; faction_key: string | null };

const GRID = 10;
const cellKey = (x: number, y: number) => `${x},${y}`;

export function BoardPane({
  label,
  storageKey,
}: {
  label: string;
  storageKey: string;
}) {
  const supabase = useMemo<SupabaseClient>(
    () =>
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { storageKey, persistSession: true, autoRefreshToken: true } },
      ),
    [storageKey],
  );

  const [factions, setFactions] = useState<Faction[]>([]);
  const [cells, setCells] = useState<Map<string, string | null>>(new Map());
  const [balance, setBalance] = useState<number | null>(null);
  const [myFaction, setMyFaction] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const colorOf = useMemo(() => {
    const m = new Map(factions.map((f) => [f.key, f.color]));
    return (k: string | null) => (k ? (m.get(k) ?? null) : null);
  }, [factions]);

  async function refreshBalance() {
    const { data } = await supabase
      .from("wallets")
      .select("balance_credits")
      .maybeSingle();
    if (data) setBalance(data.balance_credits);
  }

  useEffect(() => {
    let channel: ReturnType<SupabaseClient["channel"]> | null = null;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) await supabase.auth.signInAnonymously();

      const [factionsRes, cellsRes] = await Promise.all([
        supabase.from("factions").select("key,name,color").order("sort"),
        supabase.from("cells").select("x,y,faction_key"),
      ]);

      const fa = (factionsRes.data ?? []) as Faction[];
      setFactions(fa);
      setMyFaction((cur) => cur || fa[0]?.key || "");

      const m = new Map<string, string | null>();
      for (let y = 0; y < GRID; y++) {
        for (let x = 0; x < GRID; x++) m.set(cellKey(x, y), null);
      }
      for (const c of (cellsRes.data ?? []) as Cell[]) {
        m.set(cellKey(c.x, c.y), c.faction_key);
      }
      setCells(m);

      await refreshBalance();

      channel = supabase
        .channel(`versus-${storageKey}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "cells" },
          (payload) => {
            const c = payload.new as Cell;
            setCells((prev) =>
              new Map(prev).set(cellKey(c.x, c.y), c.faction_key),
            );
          },
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, storageKey]);

  async function claim(x: number, y: number) {
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
    await refreshBalance();
  }

  return (
    <div className="flex h-full flex-col bg-white text-neutral-900">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-2">
        <span className="text-sm font-semibold">{label}</span>
        <div className="flex items-center gap-2">
          {factions.map((f) => {
            const selected = f.key === myFaction;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setMyFaction(f.key)}
                aria-label={f.name}
                title={f.name}
                className={`h-6 w-6 rounded-full transition ${
                  selected
                    ? "ring-2 ring-neutral-800 ring-offset-2"
                    : "opacity-60 hover:opacity-100"
                }`}
                style={{ backgroundColor: f.color }}
              />
            );
          })}
          <span className="border-l border-neutral-200 pl-2 font-mono text-xs text-neutral-600">
            {balance ?? "—"} cr
          </span>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center overflow-auto p-4">
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${GRID}, 2.25rem)` }}
        >
          {Array.from({ length: GRID * GRID }).map((_, i) => {
            const x = i % GRID;
            const y = Math.floor(i / GRID);
            const color = colorOf(cells.get(cellKey(x, y)) ?? null);
            return (
              <button
                key={i}
                type="button"
                aria-label={`${label} grid ${x}-${y}`}
                onClick={() => claim(x, y)}
                style={color ? { backgroundColor: color } : undefined}
                className="h-9 w-9 cursor-pointer border border-neutral-300 transition-colors hover:border-neutral-500"
              />
            );
          })}
        </div>
      </div>

      {error && (
        <div className="border-t border-neutral-200 bg-neutral-900 px-4 py-1.5 text-center text-xs text-white">
          {error}
        </div>
      )}
    </div>
  );
}
