import "server-only";
import type Stripe from "stripe";
import { stripeWithKey } from "./stripe";
import { createAdminClient } from "@/utils/supabase/admin";

// Runtime Stripe mode (test | live), stored in app_config and flipped from the
// admin panel. Payment routes use the keys for the active mode.

export type StripeMode = "test" | "live";

export async function getStripeMode(): Promise<StripeMode> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("app_config")
      .select("value")
      .eq("key", "stripe_mode")
      .single();
    return data?.value === "live" ? "live" : "test";
  } catch {
    return "test";
  }
}

export async function setStripeMode(mode: StripeMode): Promise<void> {
  const admin = createAdminClient();
  await admin.from("app_config").upsert({
    key: "stripe_mode",
    value: mode,
    updated_at: new Date().toISOString(),
  });
}

export function keysForMode(mode: StripeMode): {
  secret?: string;
  publishable?: string;
} {
  if (mode === "live") {
    return {
      secret: process.env.STRIPE_SECRET_KEY_LIVE,
      publishable: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE,
    };
  }
  return {
    secret: process.env.STRIPE_SECRET_KEY,
    publishable: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  };
}

export function liveConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY_LIVE &&
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE,
  );
}

// The Stripe client for the currently active mode.
export async function getModeStripe(): Promise<Stripe> {
  const mode = await getStripeMode();
  const { secret } = keysForMode(mode);
  if (!secret) {
    throw new Error(`Stripe ${mode} secret key is not configured`);
  }
  return stripeWithKey(secret);
}
