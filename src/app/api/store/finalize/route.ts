import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createClient } from "@/utils/supabase/server";
import { getModeStripe } from "@/lib/stripe-mode";
import { fulfillStore } from "@/lib/store";

export const dynamic = "force-dynamic";

// POST {session} — back from Stripe Checkout: grant the item right away (the
// webhook does the same; whichever comes first wins, the other is a no-op).
export async function POST(req: Request) {
  const { session } = (await req.json().catch(() => ({}))) as { session?: string };
  if (!session || !/^cs_[A-Za-z0-9_]+$/.test(session)) return NextResponse.json({ error: "no such checkout" }, { status: 400 });
  const { data: u } = await (await createClient()).auth.getUser();
  const user = u.user && !u.user.is_anonymous ? u.user : null;
  try {
    const stripe = await getModeStripe();
    const cs = await stripe.checkout.sessions.retrieve(session, { expand: ["payment_intent"] });
    if (cs.payment_status !== "paid" || !cs.payment_intent) return NextResponse.json({ error: "Payment isn't complete yet." }, { status: 400 });
    const pi = cs.payment_intent as Stripe.PaymentIntent;
    if (user && pi.metadata?.supabase_user_id !== user.id) return NextResponse.json({ error: "That purchase belongs to another account." }, { status: 403 });
    const r = await fulfillStore(pi);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
    return NextResponse.json({ ok: true, item: pi.metadata.item });
  } catch (e) {
    console.error("store finalize failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't confirm the purchase yet — it'll show up within a minute." }, { status: 500 });
  }
}
