"use client";

import Link from "next/link";
import { useState } from "react";
import type { Team } from "./board";
import type { ActionKind } from "@/lib/receipts";
import { StripePayment } from "./stripe-payment";

export interface PendingSpend {
  kind: ActionKind;
  amount: number;
  tiles: number; // tiles this order will seize
  side: Team;
  center: number; // the tapped tile; the server derives the full cell set
}

const COPY: Record<ActionKind, { name: string; detail: string }> = {
  flip: { name: "TAKE POSITION", detail: "Seize one (1) enemy tile." },
  x: { name: "2×2 STRIKE", detail: "Seize a 2×2 block — 4 tiles at once." },
  strike: { name: "3×3 BARRAGE", detail: "Seize a 3×3 block — 9 tiles at once." },
};

// The bonus banked pieces each bundle includes (placed free after the buy).
const BONUS: Partial<Record<ActionKind, string>> = {
  x: "Includes 2 FREE tiles to place after.",
  strike: "Includes a FREE 2×2 block + 1 FREE tile to place after.",
};

export function SpendConfirm({
  pending,
  onConfirm,
  onCancel,
}: {
  pending: PendingSpend;
  onConfirm: () => void; // called only after payment succeeds
  onCancel: () => void;
}) {
  const copy = COPY[pending.kind];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  // AUTHORIZE: create the PaymentIntent. A saved card is charged one-tap on the
  // server (status "succeeded"); a new card returns a client secret so we show
  // the inline card form. The tile flip (onConfirm) fires only after payment.
  async function authorize() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: pending.kind,
          center: pending.center,
          team: pending.side,
        }),
      });
      const data = (await res.json()) as {
        status?: string;
        clientSecret?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Couldn't start payment. Try again.");
        setBusy(false);
        return;
      }
      if (data.status === "succeeded") {
        onConfirm(); // one-tap saved-card charge already went through
        return;
      }
      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
        setBusy(false);
        return;
      }
      setError("Couldn't start payment. Try again.");
      setBusy(false);
    } catch {
      setError("Couldn't reach payments. Try again.");
      setBusy(false);
    }
  }

  return (
    <div
      className="spend-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm order"
      onClick={onCancel}
    >
      <div
        className={"spend-card " + pending.side}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="spend-kicker">◆ CONFIRM ORDER ◆</div>
        <h2 className="spend-name">{copy.name}</h2>

        {clientSecret ? (
          <>
            <p className="spend-detail spend-secure">
              🔒 <b>${pending.amount}</b> · secure · saved for one-tap next time
            </p>
            <StripePayment
              clientSecret={clientSecret}
              amount={pending.amount}
              onPaid={onConfirm}
            />
            <button
              type="button"
              className="spend-stand"
              onClick={() => setClientSecret(null)}
            >
              ‹ BACK
            </button>
          </>
        ) : (
          <>
            <p className="spend-detail">{copy.detail}</p>
            {BONUS[pending.kind] && (
              <p className="spend-bonus">🎁 {BONUS[pending.kind]}</p>
            )}
            <div className="spend-cost">
              <span className="spend-cost-label">COST</span>
              <span className="spend-cost-amt">${pending.amount}</span>
            </div>
            {error && <p className="ct-error">{error}</p>}
            <button
              className="ob-btn spend-go"
              onClick={authorize}
              disabled={busy}
              autoFocus
            >
              {busy ? "…" : `AUTHORIZE · $${pending.amount}`}
            </button>
            <button
              type="button"
              className="spend-stand"
              onClick={onCancel}
              disabled={busy}
            >
              STAND DOWN
            </button>
          </>
        )}

        <p className="spend-fine">
          All sales are final — positions can be retaken by the other side.{" "}
          <Link href="/legal#terms" className="spend-terms">
            Terms &amp; Conditions
          </Link>
        </p>
      </div>
    </div>
  );
}
