import "server-only";
import Stripe from "stripe";

// Server-only Stripe client. Reads the secret key from env (STRIPE_SECRET_KEY,
// never hard-coded). Lazily constructed so importing this module doesn't throw
// before keys are configured.

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    _stripe = new Stripe(key, {
      appInfo: { name: "Dollar Battleground" },
    });
  }
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
