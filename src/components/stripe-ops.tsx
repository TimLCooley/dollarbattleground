"use client";

import { useEffect, useState } from "react";
import { SpendConfirm, type PendingSpend } from "./spend-confirm";

// Stripe controls for the command center's ops strip: the LIVE/TEST switch
// (confirms in both directions and explains itself when the live keys are
// missing) and the cart — a payment simulation that opens the real checkout
// in whatever mode Stripe is currently in.

type Mode = "test" | "live";

async function readMode(): Promise<{ mode: Mode; liveConfigured: boolean } | null> {
  const r = await fetch("/api/admin/stripe-mode");
  return r.ok ? ((await r.json()) as { mode: Mode; liveConfigured: boolean }) : null;
}

export function StripeToggle({ onChange }: { onChange?: (mode: Mode) => void }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [liveOk, setLiveOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    readMode()
      .then((m) => {
        if (m) {
          setMode(m.mode);
          setLiveOk(m.liveConfigured);
        }
      })
      .catch(() => {});
  }, []);

  async function flip() {
    if (!mode || busy) return;
    setMsg(null);
    const next: Mode = mode === "live" ? "test" : "live";
    if (next === "live" && !liveOk) {
      setMsg(
        "Live keys aren't in Vercel — add STRIPE_SECRET_KEY_LIVE, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE and STRIPE_WEBHOOK_SECRET, then redeploy.",
      );
      return;
    }
    // Both directions are consequential — confirm before flipping.
    const warning =
      next === "live"
        ? "Switch Stripe to LIVE?\n\n• Real cards will be charged real money.\n• The autopilot will publish posts on schedule (if it's ON).\n\nContinue?"
        : "Switch Stripe back to TEST?\n\n• Real payments STOP — visitors' cards will be declined.\n• The autopilot holds all posting while in test mode.\n\nContinue?";
    if (!window.confirm(warning)) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/stripe-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      const d = (await r.json()) as { mode?: Mode; liveConfigured?: boolean; error?: string };
      if (!r.ok || !d.mode) {
        setMsg(d.error ?? "Couldn't switch mode");
        return;
      }
      setMode(d.mode);
      setLiveOk(Boolean(d.liveConfigured));
      onChange?.(d.mode);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className={"cc-switch" + (mode === "live" ? " live" : "")}
        onClick={flip}
        disabled={!mode || busy}
        title={
          mode === "live"
            ? "Real charges — click to switch to TEST"
            : liveOk
              ? "Click to go LIVE (real charges)"
              : "Live keys not configured — click for details"
        }
      >
        💳 STRIPE {mode ? mode.toUpperCase() : "…"} <span className="cc-switch-knob" aria-hidden />
      </button>
      {msg && <span className="cc-ops-err">{msg}</span>}
    </>
  );
}

const ORDERS: { label: string; order: PendingSpend }[] = [
  { label: "$1 · single tile", order: { kind: "flip", amount: 1, tiles: 1, side: "red", center: 112 } },
  { label: "$5 · 2×2", order: { kind: "x", amount: 5, tiles: 4, side: "red", center: 112 } },
  { label: "$10 · 3×3", order: { kind: "strike", amount: 10, tiles: 9, side: "red", center: 112 } },
];

export function CartButton() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [pending, setPending] = useState<PendingSpend | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function toggle() {
    setMsg(null);
    if (!open) {
      const m = await readMode().catch(() => null);
      setMode(m?.mode ?? null);
    }
    setOpen((o) => !o);
  }

  return (
    <span className="cc-cart">
      <button
        type="button"
        className="cc-cart-btn"
        onClick={toggle}
        title="Payment simulation — opens the real checkout"
        aria-label="Payment simulation"
      >
        🛒
      </button>
      {open && (
        <div className="cc-cart-menu">
          <span className="cc-cart-note">
            {mode === "live" ? "⚠ Stripe is LIVE — this is a real charge." : "Test mode — use card 4242 4242 4242 4242."}
          </span>
          {ORDERS.map((o) => (
            <button
              key={o.label}
              type="button"
              className="cc-btn sm ghost"
              onClick={() => {
                setOpen(false);
                setPending(o.order);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      {msg && <span className="cc-cart-note">{msg}</span>}
      {pending && (
        <SpendConfirm
          pending={pending}
          onConfirm={() => {
            setPending(null);
            setMsg("✓ purchase completed");
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </span>
  );
}

// The gate. The timer opens it at midnight Mountain on the last campaign day;
// this button is the override (open early / close again). Opening starts the
// launch signal to the waitlist, drained by the tick in batches.
interface Gate {
  open: boolean;
  opened_by?: string;
  launch_done?: boolean;
  launch_sent?: number;
}

export function GateButton() {
  const [gate, setGate] = useState<Gate | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/admin/gate")
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => g && setGate(g))
      .catch(() => {});
  }, []);

  async function flip() {
    if (!gate) return;
    const ok = gate.open
      ? window.confirm("Close the gates again? Visitors go back to the Coming Soon wall. Launch emails already sent stay sent.")
      : window.confirm(
          "OPEN THE GATES NOW?\n\nThe Coming Soon wall comes down for everyone and the launch signal goes to the whole waitlist — Red to Red, Blue to Blue — starting on the next tick. The timer would do this on its own at midnight on the last day.",
        );
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: gate.open ? "close" : "open" }),
      });
      if (r.ok) setGate(await r.json());
    } finally {
      setBusy(false);
    }
  }

  if (!gate) return null;
  const label = gate.open
    ? `🚪 GATES OPEN${gate.launch_sent ? ` · ${gate.launch_sent} signalled${gate.launch_done ? "" : "…"}` : ""}`
    : "🚪 GATES CLOSED";
  return (
    <button
      className={"cc-btn sm" + (gate.open ? "" : " ghost")}
      disabled={busy}
      onClick={flip}
      title={gate.open ? `opened by ${gate.opened_by ?? "?"}` : "opens itself at midnight on the last campaign day"}
    >
      {label}
    </button>
  );
}

// TikTok cross-post switch: every clip that posts to X also goes to the
// founder's TikTok through RobinReach (captioned "I built this").
export function TikTokButton() {
  const [cfg, setCfg] = useState<{ tiktok: boolean; configured: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/admin/crosspost")
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => c && setCfg(c))
      .catch(() => {});
  }, []);
  async function flip() {
    if (!cfg) return;
    if (!cfg.configured) {
      window.alert("ROBINREACH_API_KEY isn't set on Vercel.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/admin/crosspost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set", tiktok: !cfg.tiktok }),
      });
      if (r.ok) setCfg(await r.json());
    } finally {
      setBusy(false);
    }
  }
  if (!cfg) return null;
  return (
    <button
      className={"cc-btn sm" + (cfg.tiktok ? "" : " ghost")}
      disabled={busy}
      onClick={flip}
      title="Every posted clip also goes to your TikTok via RobinReach"
    >
      {cfg.tiktok ? "📱 TIKTOK ON" : "📱 TIKTOK OFF"}
    </button>
  );
}
