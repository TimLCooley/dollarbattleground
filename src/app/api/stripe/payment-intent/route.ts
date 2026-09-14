import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { isStripeConfigured } from "@/lib/stripe";
import { getModeStripe } from "@/lib/stripe-mode";
import { getOrCreateCustomer, getSavedCard } from "@/lib/stripe-customer";
import { fulfillPayment } from "@/lib/fulfill";
import { ACTION_AMOUNT, isValidCenter, type ActionKind } from "@/lib/board-patterns";

// Creates a PaymentIntent for one game action. The player sends only the CENTER
// tile + action; the server derives the amount and the exact cells (so the
// client can't widen the blast radius or underpay). A saved card is confirmed +
// fulfilled (tiles painted) server-side here (true one-tap); a new card returns
// a client secret for the inline Payment Element, finalized after confirmation.

const KINDS = new Set<ActionKind>(["flip", "x", "strike"]);

export async function POST(req: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Payments not configured" }, { status: 500 });
  }

  let kind = "" as ActionKind | "";
  let center = NaN;
  let team = "";
  let newCard = false;
  try {
    const body = (await req.json()) as {
      kind?: ActionKind;
      center?: number;
      team?: string;
      newCard?: boolean;
    };
    kind = body.kind ?? "";
    center = Number(body.center);
    team = body.team ?? "";
    newCard = Boolean(body.newCard);
  } catch {
    /* no body */
  }

  if (!kind || !KINDS.has(kind)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
  if (!isValidCenter(center)) {
    return NextResponse.json({ error: "Invalid tile" }, { status: 400 });
  }
  if (team !== "red" && team !== "blue") {
    return NextResponse.json({ error: "Invalid team" }, { status: 400 });
  }
  const dollars = ACTION_AMOUNT[kind];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const stripe = await getModeStripe();
  const metadata = {
    supabase_user_id: user.id,
    kind,
    center: String(center),
    team,
    dollars: String(dollars),
  };

  try {
    const customerId = await getOrCreateCustomer(user.id, user.email ?? null);
    const savedCard = newCard ? null : await getSavedCard(customerId);

    // One-tap: charge the saved card, then paint server-side right here.
    if (savedCard) {
      const pi = await stripe.paymentIntents.create({
        amount: dollars * 100,
        currency: "usd",
        customer: customerId,
        payment_method: savedCard,
        confirm: true,
        off_session: false,
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        metadata,
      });
      if (pi.status === "succeeded") {
        const f = await fulfillPayment(pi.id);
        if (!f.ok) {
          return NextResponse.json({ error: f.error ?? "Flip failed" }, { status: 500 });
        }
        return NextResponse.json({ status: "succeeded", paymentIntentId: pi.id });
      }
      // 3-D Secure etc. — finish in the browser.
      return NextResponse.json({
        status: pi.status,
        clientSecret: pi.client_secret,
        savedCard: true,
      });
    }

    // First purchase: collect + save the card in the browser (card-only, so the
    // confirm needs no return_url round-trip).
    const pi = await stripe.paymentIntents.create({
      amount: dollars * 100,
      currency: "usd",
      customer: customerId,
      setup_future_usage: "off_session",
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      metadata,
    });
    return NextResponse.json({
      status: "requires_payment_method",
      clientSecret: pi.client_secret,
      savedCard: false,
    });
  } catch (e: unknown) {
    const msg =
      typeof e === "object" && e !== null && "message" in e
        ? String((e as { message?: string }).message)
        : "Payment failed";
    return NextResponse.json({ error: msg }, { status: 402 });
  }
}
