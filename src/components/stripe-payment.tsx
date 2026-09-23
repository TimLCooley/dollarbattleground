"use client";

import {
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import type { Appearance } from "@stripe/stripe-js";
import { useState } from "react";
import { getStripeJs } from "@/lib/stripe-client";

function PayForm({ amount, onPaid }: { amount: number; onPaid: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hasExpress, setHasExpress] = useState(false);
  const [showCard, setShowCard] = useState(false);

  // One confirm path for both the express wallets and the card form.
  async function confirm() {
    if (!stripe || !elements) return;
    setBusy(true);
    setErr(null);
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });
    if (error) {
      setErr(error.message ?? "That card was declined. Try another.");
      setBusy(false);
      return;
    }
    if (
      paymentIntent &&
      (paymentIntent.status === "succeeded" || paymentIntent.status === "processing")
    ) {
      try {
        await fetch("/api/stripe/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
        });
      } catch {
        /* webhook will cover it */
      }
      onPaid();
      return;
    }
    setErr("Payment didn't complete. Try again.");
    setBusy(false);
  }

  return (
    <div className="pay-form">
      {/* One-tap wallets (Apple Pay / Google Pay / Link) — the fast path. */}
      <ExpressCheckoutElement
        onReady={(e) => setHasExpress(!!e.availablePaymentMethods)}
        onConfirm={confirm}
      />

      {/* Card form: shown only if there are no wallets, or on request. */}
      {hasExpress && !showCard ? (
        <button type="button" className="pay-cardlink" onClick={() => setShowCard(true)}>
          or pay with card
        </button>
      ) : (
        <>
          {hasExpress && <div className="pay-or">or pay with card</div>}
          <PaymentElement
            options={{
              layout: "tabs",
              fields: { billingDetails: { address: { country: "never" } } },
            }}
          />
          {err && <p className="ct-error">{err}</p>}
          <button className="ob-btn" onClick={confirm} disabled={busy}>
            {busy ? "PROCESSING…" : `PAY $${amount}`}
          </button>
        </>
      )}
      {hasExpress && !showCard && err && <p className="ct-error">{err}</p>}
    </div>
  );
}

const APPEARANCE: Appearance = {
  theme: "night",
  variables: {
    colorPrimary: "#f2c14e",
    colorBackground: "#124f2b",
    colorText: "#f6efdb",
    fontFamily: "ui-rounded, system-ui, sans-serif",
    borderRadius: "6px",
    spacingUnit: "3px",
    fontSizeBase: "14px",
  },
};

export function StripePayment({
  clientSecret,
  amount,
  onPaid,
}: {
  clientSecret: string;
  amount: number;
  onPaid: () => void;
}) {
  return (
    <Elements stripe={getStripeJs()} options={{ clientSecret, appearance: APPEARANCE }}>
      <PayForm amount={amount} onPaid={onPaid} />
    </Elements>
  );
}
