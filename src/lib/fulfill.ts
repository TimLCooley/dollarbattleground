import "server-only";
import { getModeStripe } from "./stripe-mode";
import { createAdminClient } from "@/utils/supabase/admin";
import { cellsFor, isValidCenter, type ActionKind } from "./board-patterns";

// The single, idempotent place a paid flip happens. Called by BOTH the webhook
// (reliable, source of truth) and the finalize route (instant UX). It verifies
// with Stripe that the PaymentIntent actually succeeded, then paints the exact
// cells the purchase covered — derived server-side from the center + action, so
// the client can never widen the blast radius. A metadata marker makes repeat
// calls (webhook + finalize racing) no-ops.

export interface FulfillResult {
  ok: boolean;
  already?: boolean;
  error?: string;
}

export async function fulfillPayment(
  paymentIntentId: string,
): Promise<FulfillResult> {
  const stripe = await getModeStripe();
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (pi.status !== "succeeded") {
    return { ok: false, error: `payment not completed (${pi.status})` };
  }
  if (pi.metadata?.fulfilled_at) {
    return { ok: true, already: true };
  }

  const kind = pi.metadata.kind as ActionKind;
  const center = Number(pi.metadata.center);
  const team = pi.metadata.team;
  const owner = pi.metadata.supabase_user_id;

  if (
    (kind !== "flip" && kind !== "x" && kind !== "strike") ||
    !isValidCenter(center) ||
    (team !== "red" && team !== "blue") ||
    !owner
  ) {
    return { ok: false, error: "bad payment metadata" };
  }

  const cells = cellsFor(kind, center);
  const admin = createAdminClient();
  const { error } = await admin.rpc("claim_paid", {
    p_cells: cells,
    p_team: team,
    p_owner: owner,
  });
  if (error) {
    return { ok: false, error: error.message };
  }

  // Mark fulfilled so a second call (webhook/finalize race) is a no-op.
  await stripe.paymentIntents.update(paymentIntentId, {
    metadata: { ...pi.metadata, fulfilled_at: new Date().toISOString() },
  });

  return { ok: true };
}
