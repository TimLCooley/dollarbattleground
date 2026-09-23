import "server-only";
import { getModeStripe } from "./stripe-mode";

// One Stripe Customer per Supabase user. We tag the customer with the Supabase
// user id in metadata and look it up by search — no DB migration required. If a
// profiles.stripe_customer_id column is added later, this can read/write that
// instead for a faster lookup.

export async function getOrCreateCustomer(
  userId: string,
  email?: string | null,
): Promise<string> {
  const stripe = await getModeStripe();

  // Existing customer for this user?
  const found = await stripe.customers.search({
    query: `metadata['supabase_user_id']:'${userId}'`,
    limit: 1,
  });
  if (found.data[0]) {
    const c = found.data[0];
    // Backfill email if we have one now and it changed.
    if (email && c.email !== email) {
      await stripe.customers.update(c.id, { email });
    }
    return c.id;
  }

  const created = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { supabase_user_id: userId },
  });
  return created.id;
}

// The customer's default / most-recent saved card, if any, for one-tap repeat
// charges. Returns the payment method id or null.
export async function getSavedCard(customerId: string): Promise<string | null> {
  const stripe = await getModeStripe();
  const customer = await stripe.customers.retrieve(customerId);
  if (!customer.deleted) {
    const def = customer.invoice_settings?.default_payment_method;
    if (typeof def === "string") return def;
  }
  const pms = await stripe.paymentMethods.list({
    customer: customerId,
    type: "card",
    limit: 1,
  });
  return pms.data[0]?.id ?? null;
}
