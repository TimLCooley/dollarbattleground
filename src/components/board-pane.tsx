"use client";

import { createClient } from "@supabase/supabase-js";
import { useMemo } from "react";
import { GRID, useBoard } from "@/hooks/use-board";
import { BreachToasts } from "@/components/breach-toasts";

export function BoardPane({
  label,
  storageKey,
}: {
  label: string;
  storageKey: string;
}) {
  const supabase = useMemo(
    () =>
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { storageKey, persistSession: true, autoRefreshToken: true } },
      ),
    [storageKey],
  );

  const board = useBoard(supabase);

  return (
    <div className="relative flex h-full flex-col bg-white text-neutral-900">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-2">
        <span className="text-sm font-semibold">{label}</span>
        <div className="flex items-center gap-2">
          {board.factions.map((f) => {
            const selected = f.key === board.myFaction;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => board.setMyFaction(f.key)}
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
            {board.balance ?? "—"} cr
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
            const color = board.colorAt(x, y);
            return (
              <button
                key={i}
                type="button"
                aria-label={`${label} grid ${x}-${y}`}
                onClick={() => board.claim(x, y)}
                style={color ? { backgroundColor: color } : undefined}
                className="h-9 w-9 cursor-pointer border border-neutral-300 transition-colors hover:border-neutral-500"
              />
            );
          })}
        </div>
      </div>

      {board.error && (
        <div className="border-t border-neutral-200 bg-neutral-900 px-4 py-1.5 text-center text-xs text-white">
          {board.error}
        </div>
      )}

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
