import "server-only";
import type Stripe from "stripe";
import { createAdminClient } from "@/utils/supabase/admin";
import { getModeStripe } from "./stripe-mode";
import { priceOf } from "./commander/skins";

// The CommanderBG store's single, idempotent grant. Called by the Stripe
// webhook (source of truth) and by the checkout return (instant). It trusts
// only what Stripe says: the PaymentIntent must have succeeded, and the item
// and price must match the catalog. Any purchase also commissions the buyer
// as an officer (commander_profile.officer_since), if they weren't already.

export async function fulfillStore(pi: Stripe.PaymentIntent): Promise<{ ok: boolean; already?: boolean; error?: string }> {
  if (pi.status !== "succeeded") return { ok: false, error: `payment not completed (${pi.status})` };
  const item = pi.metadata?.item;
  const owner = pi.metadata?.supabase_user_id;
  const price = item ? priceOf(item) : null;
  if (!item || !owner || price == null) return { ok: false, error: "bad store metadata" };
  if (pi.amount_received < price) return { ok: false, error: "amount doesn't match the item" };
  const db = createAdminClient();
  const { error } = await db
    .from("store_entitlements")
    .upsert({ user_id: owner, item, payment_intent: pi.id, amount_cents: pi.amount_received }, { onConflict: "user_id,item", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
  // commissioned on their first purchase — never moved later
  await db.from("commander_profile").upsert({ user_id: owner }, { onConflict: "user_id", ignoreDuplicates: true });
  await db.from("commander_profile").update({ officer_since: new Date().toISOString() }).eq("user_id", owner).is("officer_since", null);
  if (!pi.metadata.fulfilled_at) {
    const stripe = await getModeStripe();
    await stripe.paymentIntents.update(pi.id, { metadata: { ...pi.metadata, fulfilled_at: new Date().toISOString() } });
    return { ok: true };
  }
  return { ok: true, already: true };
}

/** Items a player owns (skin ids, plus "all" for all-access). */
export async function ownedItems(userId: string): Promise<string[]> {
  const { data } = await createAdminClient().from("store_entitlements").select("item").eq("user_id", userId);
  return (data ?? []).map((r: { item: string }) => r.item);
}
