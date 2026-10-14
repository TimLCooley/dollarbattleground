"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Crate = { id: number; side: string; singles: number; blocks: number; strikes: number };

const contents = (c: Crate) =>
  [c.strikes ? "a 3×3" : "", c.blocks ? "a 2×2" : "", c.singles ? `${c.singles}× 1×1` : ""].filter(Boolean).join(" + ");

// The trailing side's extra supplies arrive as a crate the player opens.
export function ResupplyDrop({ active }: { active: boolean }) {
  const [crate, setCrate] = useState<Crate | null>(null);
  const [state, setState] = useState<"closed" | "open" | "collecting" | "done">("closed");

  useEffect(() => {
    if (!active) return;
    let alive = true;
    createClient()
      .rpc("my_resupply")
      .then(({ data }) => {
        const c = data as Crate | null;
        if (alive && c && c.id) {
          setCrate(c);
          setState("open");
        }
      });
    return () => {
      alive = false;
    };
  }, [active]);

  if (!crate || state === "closed") return null;
  const Side = crate.side === "blue" ? "Blue" : "Red";

  async function collect() {
    if (!crate) return;
    setState("collecting");
    await createClient().rpc("collect_resupply", { p_id: crate.id });
    setState("done");
    window.setTimeout(() => setState("closed"), 1800);
  }

  return (
    <div className="ob-overlay" role="dialog" aria-modal="true" aria-label="Resupply drop">
      <div className={"ob-card resupply " + crate.side}>
        <div className="ob-kicker">◆ RESUPPLY DROP ◆</div>
        <div className={"resupply-crate" + (state === "done" ? " opened" : "")} aria-hidden>📦</div>
        <h2 className="ob-title">{state === "done" ? "COLLECTED" : "SUPPLIES INBOUND"}</h2>
        <p className="ob-body">
          {state === "done" ? (
            <>
              <b>{contents(crate)}</b> added to your supplies. Go take some ground.
            </>
          ) : (
            <>
              {Side} is behind, so command dropped you <b>{contents(crate)}</b>.
            </>
          )}
        </p>
        {state !== "done" && (
          <button className="ob-btn" onClick={collect} disabled={state === "collecting"}>
            {state === "collecting" ? "OPENING…" : "COLLECT →"}
          </button>
        )}
      </div>
    </div>
  );
}
