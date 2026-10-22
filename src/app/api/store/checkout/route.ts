import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { isStripeConfigured } from "@/lib/stripe";
import { getModeStripe } from "@/lib/stripe-mode";
import { getOrCreateCustomer } from "@/lib/stripe-customer";
import { ownedItems } from "@/lib/store";
import { ALL_ACCESS, owns, priceOf, skinById } from "@/lib/commander/skins";

export const dynamic = "force-dynamic";

// POST {item} — a Stripe Checkout page for one store item. The price comes
// from the catalog on the server, never from the browser. Stripe sends the
// buyer back to /store?paid=<session>, and the webhook grants it either way.
export async function POST(req: Request) {
  if (!isStripeConfigured()) return NextResponse.json({ error: "The store isn't open yet — try again soon." }, { status: 500 });
  const { data: u } = await (await createClient()).auth.getUser();
  const user = u.user && !u.user.is_anonymous ? u.user : null;
  if (!user) return NextResponse.json({ error: "Log in to buy — your skins stay with your account on every device." }, { status: 401 });
  const { item } = (await req.json().catch(() => ({}))) as { item?: string };
  const price = item ? priceOf(item) : null;
  if (!item || price == null) return NextResponse.json({ error: "That item isn't for sale." }, { status: 400 });
  const owned = await ownedItems(user.id);
  if (item === ALL_ACCESS.id ? owned.includes(ALL_ACCESS.id) : owns(owned, item)) {
    return NextResponse.json({ error: "You already own this." }, { status: 400 });
  }
  const name = item === ALL_ACCESS.id ? ALL_ACCESS.name : `${skinById(item)!.name} skin`;
  const origin = new URL(req.url).origin;
  try {
    const stripe = await getModeStripe();
    const customer = await getOrCreateCustomer(user.id, user.email ?? null);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: price,
            product_data: {
              name: `CommanderBG — ${name}`,
              description: item === ALL_ACCESS.id ? "Every skin, including future ones." : "A CommanderBG skin, yours forever.",
              // Stripe Managed Payments (on for this account) handles sales tax
              // and needs a digital-goods tax code: video game items, permanent rights
              tax_code: "txcd_10201000",
            },
          },
        },
      ],
      payment_intent_data: { metadata: { kind: "store", item, supabase_user_id: user.id } },
      metadata: { kind: "store", item, supabase_user_id: user.id },
      success_url: `${origin}/store?paid={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/store`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("store checkout failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't open checkout — try again in a minute." }, { status: 500 });
  }
}
