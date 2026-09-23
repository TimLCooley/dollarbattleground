import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { fulfillPayment } from "@/lib/fulfill";
import type Stripe from "stripe";

// Stripe's source of truth. Verifies the signature, then fulfills paid flips
// even if the buyer's browser closed mid-payment. Idempotent via fulfillPayment.
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "bad signature";
    return NextResponse.json({ error: `Webhook error: ${msg}` }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const result = await fulfillPayment(pi.id);
    if (!result.ok) {
      // Non-2xx tells Stripe to retry.
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
