import "server-only";
import { getModeStripe } from "./stripe-mode";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  cellsFor,
  isValidCenter,
  ACTION_AMOUNT,
  type ActionKind,
} from "./board-patterns";

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

  // Bonus banked pieces for the bundle. Overlap (tiles in the block already this
  // team's) is computed BEFORE painting and converts to banked singles (no-waste).
  let bonusSingles = 0;
  let bonusBlocks = 0;
  if (kind === "x") bonusSingles = 2;
  else if (kind === "strike") {
    bonusSingles = 1;
    bonusBlocks = 1;
  }
  if (kind === "x" || kind === "strike") {
    const xs = cells.map((c) => c.x);
    const ys = cells.map((c) => c.y);
    const { data: ownAlready } = await admin
      .from("tiles")
      .select("x")
      .eq("team", team)
      .gte("x", Math.min(...xs))
      .lte("x", Math.max(...xs))
      .gte("y", Math.min(...ys))
      .lte("y", Math.max(...ys));
    bonusSingles += ownAlready?.length ?? 0;
  }

  const { error } = await admin.rpc("claim_paid", {
    p_cells: cells,
    p_team: team,
    p_owner: owner,
    p_amount_cents: ACTION_AMOUNT[kind] * 100,
  });
  if (error) {
    return { ok: false, error: error.message };
  }

  // Credit the banked bonus pieces. A failure here doesn't undo the paid paint
  // (which already succeeded), so we log rather than fail the whole fulfillment.
  if (bonusSingles > 0 || bonusBlocks > 0) {
    const { error: bankErr } = await admin.rpc("credit_bank", {
      p_owner: owner,
      p_singles: bonusSingles,
      p_blocks: bonusBlocks,
    });
    if (bankErr) console.error("credit_bank failed:", bankErr.message);
  }

  // Mark fulfilled so a second call (webhook/finalize race) is a no-op.
  await stripe.paymentIntents.update(paymentIntentId, {
    metadata: { ...pi.metadata, fulfilled_at: new Date().toISOString() },
  });

  return { ok: true };
}
