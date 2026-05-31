"use client";

import { useEffect, useRef } from "react";
import type { Breach } from "@/hooks/use-board";

export function BreachToasts({
  breaches,
  factionName,
  colorOf,
  onRetaliate,
  onDismiss,
}: {
  breaches: Breach[];
  factionName: (key: string | null) => string;
  colorOf: (key: string | null) => string | null;
  onRetaliate: (b: Breach) => void;
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[9997] flex w-max max-w-[90vw] -translate-x-1/2 flex-col gap-2">
      {breaches.map((b) => (
        <BreachToast
          key={b.id}
          b={b}
          factionName={factionName}
          colorOf={colorOf}
          onRetaliate={onRetaliate}
          onDismiss={onDismiss}
        />
      ))}
    </div>
  );
}

function BreachToast({
  b,
  factionName,
  colorOf,
  onRetaliate,
  onDismiss,
}: {
  b: Breach;
  factionName: (key: string | null) => string;
  colorOf: (key: string | null) => string | null;
  onRetaliate: (b: Breach) => void;
  onDismiss: (id: number) => void;
}) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const t = setTimeout(() => dismissRef.current(b.id), 8000);
    return () => clearTimeout(t);
  }, [b.id]);

  const color = colorOf(b.factionKey) ?? "#dc2626";

  return (
    <div
      className="pointer-events-auto flex items-center gap-3 rounded-md border-l-4 bg-neutral-900 px-4 py-2 text-white shadow-lg"
      style={{ borderLeftColor: color }}
    >
      <span className="font-mono text-xs">
        ⚠ BREACH — grid {b.x}-{b.y} overrun by the {factionName(b.factionKey)}s
      </span>
      <button
        type="button"
        onClick={() => onRetaliate(b)}
        className="rounded bg-white px-2 py-0.5 text-xs font-semibold text-neutral-900 hover:bg-neutral-200"
      >
        Retaliate
      </button>
      <button
        type="button"
        onClick={() => onDismiss(b.id)}
        aria-label="Dismiss"
        className="text-xs text-neutral-400 hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
