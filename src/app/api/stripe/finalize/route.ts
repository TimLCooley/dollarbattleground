import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getStripe } from "@/lib/stripe";
import { fulfillPayment } from "@/lib/fulfill";

// Called by the browser right after a card payment confirms, so the flip shows
// immediately. It re-checks with Stripe that the PaymentIntent succeeded AND
// belongs to the signed-in user before painting — the webhook is the backstop
// if the browser never gets here.
export async function POST(req: Request) {
  let paymentIntentId = "";
  try {
    const body = (await req.json()) as { paymentIntentId?: string };
    paymentIntentId = body.paymentIntentId ?? "";
  } catch {
    /* no body */
  }
  if (!paymentIntentId) {
    return NextResponse.json({ error: "Missing paymentIntentId" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Authorization: you can only finalize your own payment.
  const pi = await getStripe().paymentIntents.retrieve(paymentIntentId);
  if (pi.metadata?.supabase_user_id !== user.id) {
    return NextResponse.json({ error: "Not your payment" }, { status: 403 });
  }

  const result = await fulfillPayment(paymentIntentId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
