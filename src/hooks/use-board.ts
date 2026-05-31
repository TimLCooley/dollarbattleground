"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Faction = { key: string; name: string; color: string };
export type CellRow = {
  x: number;
  y: number;
  faction_key: string | null;
  owner_id?: string | null;
};
type CellState = { faction: string | null; owner: string | null };
export type Breach = {
  id: number;
  x: number;
  y: number;
  factionKey: string | null;
};

export const GRID = 10;
const cellKey = (x: number, y: number) => `${x},${y}`;

export function useBoard(
  supabase: SupabaseClient,
  initial?: { factions?: Faction[]; cells?: CellRow[]; balance?: number | null },
) {
  const [factions, setFactions] = useState<Faction[]>(initial?.factions ?? []);
  const [cells, setCells] = useState<Map<string, CellState>>(() => {
    const m = new Map<string, CellState>();
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) m.set(cellKey(x, y), { faction: null, owner: null });
    }
    for (const c of initial?.cells ?? []) {
      m.set(cellKey(c.x, c.y), { faction: c.faction_key, owner: c.owner_id ?? null });
    }
    return m;
  });
  const [balance, setBalance] = useState<number | null>(initial?.balance ?? null);
  const [myFaction, setMyFaction] = useState<string>(
    initial?.factions?.[0]?.key ?? "",
  );
  const [breaches, setBreaches] = useState<Breach[]>([]);
  const [error, setError] = useState<string | null>(null);

  const userIdRef = useRef<string | null>(null);
  const ownedRef = useRef<Set<string>>(new Set());
  const breachIdRef = useRef(1);
  const myFactionRef = useRef(myFaction);
  myFactionRef.current = myFaction;

  const colorOf = useMemo(() => {
    const m = new Map(factions.map((f) => [f.key, f.color]));
    return (k: string | null) => (k ? (m.get(k) ?? null) : null);
  }, [factions]);

  const factionName = useCallback(
    (k: string | null) => factions.find((f) => f.key === k)?.name ?? "Independent",
    [factions],
  );

  const refreshBalance = useCallback(async () => {
    const { data } = await supabase
      .from("wallets")
      .select("balance_credits")
      .maybeSingle();
    if (data) setBalance(data.balance_credits);
  }, [supabase]);

  useEffect(() => {
    let channel: ReturnType<SupabaseClient["channel"]> | null = null;
    let cancelled = false;

    (async () => {
      let {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        await supabase.auth.signInAnonymously();
        ({
          data: { user },
        } = await supabase.auth.getUser());
      }
      const uid = user?.id ?? null;
      userIdRef.current = uid;
      if (cancelled) return;

      if (!initial?.factions || !initial?.cells) {
        const [f, c] = await Promise.all([
          supabase.from("factions").select("key,name,color").order("sort"),
          supabase.from("cells").select("x,y,faction_key,owner_id"),
        ]);
        if (cancelled) return;
        const fa = (f.data ?? []) as Faction[];
        setFactions(fa);
        setMyFaction((cur) => cur || fa[0]?.key || "");
        const m = new Map<string, CellState>();
        for (let y = 0; y < GRID; y++) {
          for (let x = 0; x < GRID; x++) m.set(cellKey(x, y), { faction: null, owner: null });
        }
        for (const cell of (c.data ?? []) as CellRow[]) {
          m.set(cellKey(cell.x, cell.y), {
            faction: cell.faction_key,
            owner: cell.owner_id ?? null,
          });
        }
        setCells(m);
      }

      if (uid) {
        const { data: mine } = await supabase
          .from("cells")
          .select("x,y")
          .eq("owner_id", uid);
        ownedRef.current = new Set(
          (mine ?? []).map((c: { x: number; y: number }) => cellKey(c.x, c.y)),
        );
      }

      await refreshBalance();
      if (cancelled) return;

      channel = supabase
        .channel(`board-${uid ?? "anon"}-${Math.random().toString(36).slice(2)}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "cells" },
          (payload) => {
            const n = payload.new as {
              x: number;
              y: number;
              faction_key: string | null;
              owner_id: string | null;
            };
            const k = cellKey(n.x, n.y);
            const myId = userIdRef.current;
            const wasMine = ownedRef.current.has(k);
            const nowMine = !!myId && n.owner_id === myId;

            if (wasMine && !nowMine) {
              const id = breachIdRef.current++;
              setBreaches((prev) =>
                [{ id, x: n.x, y: n.y, factionKey: n.faction_key }, ...prev].slice(0, 4),
              );
            }
            if (nowMine) ownedRef.current.add(k);
            else ownedRef.current.delete(k);

            setCells((prev) =>
              new Map(prev).set(k, { faction: n.faction_key, owner: n.owner_id }),
            );
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const claim = useCallback(
    async (x: number, y: number) => {
      setError(null);
      const { error: rpcError } = await supabase.rpc("claim_cell", {
        p_x: x,
        p_y: y,
        p_faction_key: myFactionRef.current,
      });
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      ownedRef.current.add(cellKey(x, y));
      await refreshBalance();
    },
    [supabase, refreshBalance],
  );

  const dismissBreach = useCallback((id: number) => {
    setBreaches((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const retaliate = useCallback(
    (b: Breach) => {
      dismissBreach(b.id);
      void claim(b.x, b.y);
    },
    [claim, dismissBreach],
  );

  const colorAt = useCallback(
    (x: number, y: number) => colorOf(cells.get(cellKey(x, y))?.faction ?? null),
    [colorOf, cells],
  );

  return {
    factions,
    colorOf,
    colorAt,
    factionName,
    balance,
    myFaction,
    setMyFaction,
    claim,
    breaches,
    retaliate,
    dismissBreach,
    error,
  };
}
