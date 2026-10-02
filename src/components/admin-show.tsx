"use client";

import { useEffect, useState } from "react";
import { normalizeShow, type ShowConfig, type ShowIntensity, type ShowWho } from "@/lib/war-show";
import { useShowPreview } from "./use-war-show";

// The War Show strip for the command console: switch the simulated war on
// for visitors and tune how it paces itself. The real board never changes —
// it's an overlay in each visitor's browser (see use-war-show.ts). Admins see
// reality on their own board unless they turn the preview on here.

const WHO: { v: ShowWho; label: string; title: string }[] = [
  { v: "both", label: "BOTH SIDES", title: "Red and Blue trade blows" },
  { v: "allies", label: "ALLIES", title: "Only the viewer's side attacks" },
  { v: "enemy", label: "ENEMY", title: "Only the enemy attacks — pressure" },
];
const MIX: { v: ShowIntensity; label: string; title: string }[] = [
  { v: "calm", label: "CALM", title: "Mostly single tiles" },
  { v: "normal", label: "NORMAL", title: "Singles with the odd block" },
  { v: "heavy", label: "HEAVY", title: "Plenty of 2×2 and 3×3 blocks" },
];

function Num({
  label,
  value,
  unit,
  min,
  max,
  onCommit,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  // A saved value (or a rejected save rolling back) replaces what's typed.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(String(value));
  }
  const commit = () => {
    const n = Number(text);
    if (!Number.isFinite(n)) return setText(String(value));
    const v = Math.min(max, Math.max(min, Math.round(n)));
    setText(String(v));
    if (v !== value) onCommit(v);
  };
  return (
    <label className="adm-num">
      <span className="adm-num-l">{label}</span>
      <input
        className="adm-num-in"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      <span className="adm-num-u">{unit}</span>
    </label>
  );
}

export function AdminShow() {
  const [cfg, setCfg] = useState<ShowConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { preview, toggle: togglePreview } = useShowPreview();

  useEffect(() => {
    fetch("/api/admin/show")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Couldn't load the show"))))
      .then((d) => setCfg(normalizeShow(d)))
      .catch((e) => setErr(e instanceof Error ? e.message : "Couldn't load the show"));
  }, []);

  async function patch(p: Partial<ShowConfig>) {
    if (!cfg || busy) return;
    setBusy(true);
    setErr(null);
    const prev = cfg;
    setCfg(normalizeShow({ ...cfg, ...p })); // optimistic
    try {
      const r = await fetch("/api/admin/show", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patch: p }),
      });
      const d = (await r.json()) as ShowConfig & { error?: string };
      if (!r.ok) throw new Error(d.error ?? "Couldn't save");
      setCfg(normalizeShow(d));
    } catch (e) {
      setCfg(prev);
      setErr(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={"adm-mode adm-show" + (cfg?.on ? " on" : "")} aria-label="War Show">
      <div className="adm-show-row">
        <span className="adm-mode-label">◆ WAR SHOW</span>
        <div className="adm-toggle" role="group" aria-label="War Show on or off">
          <button
            type="button"
            className={"adm-toggle-opt" + (cfg && !cfg.on ? " on" : "")}
            disabled={!cfg || busy}
            onClick={() => patch({ on: false })}
          >
            OFF
          </button>
          <button
            type="button"
            className={"adm-toggle-opt live" + (cfg?.on ? " on" : "")}
            disabled={!cfg || busy}
            onClick={() => patch({ on: true })}
          >
            ON
          </button>
        </div>
        <span className={"adm-mode-state" + (cfg?.on ? " live" : "")}>
          {!cfg ? "…" : cfg.on ? "Visitors see a live war" : "Visitors see the real board"}
        </span>
        <span className="adm-spacer" />
        <button
          type="button"
          className={"adm-toggle-opt adm-preview" + (preview ? " on" : "")}
          onClick={togglePreview}
          title="Admins see the real board. Turn this on to watch the show on your own board (this browser only)."
        >
          PREVIEW ON MY BOARD: {preview ? "ON" : "OFF"}
        </button>
      </div>

      {cfg && (
        <div className="adm-show-row">
          <div className="adm-toggle" role="group" aria-label="Who attacks">
            {WHO.map((w) => (
              <button
                key={w.v}
                type="button"
                className={"adm-toggle-opt" + (cfg.who === w.v ? " on" : "")}
                title={w.title}
                disabled={busy}
                onClick={() => patch({ who: w.v })}
              >
                {w.label}
              </button>
            ))}
          </div>
          <div className="adm-toggle" role="group" aria-label="Strike mix">
            {MIX.map((m) => (
              <button
                key={m.v}
                type="button"
                className={"adm-toggle-opt" + (cfg.intensity === m.v ? " on" : "")}
                title={m.title}
                disabled={busy}
                onClick={() => patch({ intensity: m.v })}
              >
                {m.label}
              </button>
            ))}
          </div>
          <Num label="first" value={cfg.firstS} unit="s" min={3} max={300} onCommit={(v) => patch({ firstS: v })} />
          <Num label="gap" value={cfg.minGapS} unit="s" min={5} max={600} onCommit={(v) => patch({ minGapS: v })} />
          <Num label="→" value={cfg.maxGapS} unit="s" min={5} max={1800} onCommit={(v) => patch({ maxGapS: v })} />
          <Num label="drift" value={cfg.drift} unit="tiles" min={1} max={120} onCommit={(v) => patch({ drift: v })} />
        </div>
      )}

      <p className="adm-mode-note">
        Bombs fly in and turn tiles while someone watches — in their browser only. The real board never changes,
        their own tiles are never touched, a reload shows reality, and real flips always win. The first strike lands
        after <b>first</b>; the pause between strikes stretches from <b>gap</b> to the second number over ten minutes
        on the page. <b>Drift</b> caps how many tiles may differ from reality at once.
      </p>
      {err && <p className="adm-mode-err">{err}</p>}
    </section>
  );
}
