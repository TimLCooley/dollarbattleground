"use client";

import {
  Elements,
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

  async function pay() {
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
      (paymentIntent.status === "succeeded" ||
        paymentIntent.status === "processing")
    ) {
      // Ask the server to verify the payment and paint the tiles (the webhook
      // is the backstop if this call is lost). Best-effort — proceed either way.
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
      <PaymentElement options={{ layout: "tabs" }} />
      {err && <p className="ct-error">{err}</p>}
      <button className="ob-btn" onClick={pay} disabled={busy}>
        {busy ? "PROCESSING…" : `PAY $${amount}`}
      </button>
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
    borderRadius: "4px",
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
    <Elements
      stripe={getStripeJs()}
      options={{ clientSecret, appearance: APPEARANCE }}
    >
      <PayForm amount={amount} onPaid={onPaid} />
    </Elements>
  );
}
