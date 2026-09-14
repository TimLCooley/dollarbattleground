import { loadStripe, type Stripe } from "@stripe/stripe-js";

// Loads Stripe.js with the publishable key for the currently active mode, which
// the server reports at /api/stripe/config. Cached for the session.
let stripePromise: Promise<Stripe | null> | null = null;

export function getStripeJs(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = fetch("/api/stripe/config")
      .then((r) => r.json())
      .then((d: { publishableKey?: string | null }) =>
        d?.publishableKey ? loadStripe(d.publishableKey) : null,
      )
      .catch(() => null);
  }
  return stripePromise;
}
