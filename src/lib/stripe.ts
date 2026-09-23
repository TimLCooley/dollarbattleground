import "server-only";
import Stripe from "stripe";

// Server-only Stripe clients, cached per secret key so we can hold both a test
// and a live client (the admin panel toggles which mode is active). Keys come
// from env, never hard-coded.

const clients = new Map<string, Stripe>();

export function stripeWithKey(secret: string): Stripe {
  let c = clients.get(secret);
  if (!c) {
    c = new Stripe(secret, { appInfo: { name: "Dollar Battleground" } });
    clients.set(secret, c);
  }
  return c;
}

// Default (test) client — for mode-agnostic work like webhook signature checks.
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  return stripeWithKey(key);
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
