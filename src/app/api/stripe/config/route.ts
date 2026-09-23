import { NextResponse } from "next/server";
import { getStripeMode, keysForMode } from "@/lib/stripe-mode";

// Public: tells the browser which mode is active and which publishable key to
// load Stripe.js with. Publishable keys are safe to expose.
export async function GET() {
  const mode = await getStripeMode();
  const { publishable } = keysForMode(mode);
  return NextResponse.json({ mode, publishableKey: publishable ?? null });
}
