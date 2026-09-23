import "server-only";
import { createAdminClient } from "@/utils/supabase/admin";
import { getWallet } from "./heygen";

// Budget guard for HeyGen video renders. Three independent hard limits — a
// per-day render count, a monthly USD ceiling, and the live wallet balance —
// any one of which blocks a render BEFORE it spends. Fail-closed: if we can't
// verify spend (e.g. the log table isn't there yet), we refuse rather than risk
// overspending. Caps are env-overridable so the command center can tune them.

const MONTHLY_USD_CAP = Number(process.env.HEYGEN_MONTHLY_USD_CAP ?? 15);
const DAILY_RENDER_CAP = Number(process.env.HEYGEN_DAILY_RENDER_CAP ?? 20);
// Conservative $/sec until we calibrate on the first real render (overestimate
// on purpose so the guard errs toward safety).
const USD_PER_SEC = Number(process.env.HEYGEN_USD_PER_SEC ?? 0.1);

export function estimateCostUsd(seconds: number): number {
  return Math.max(0, seconds) * USD_PER_SEC;
}

export interface BudgetStatus {
  monthSpentUsd: number;
  monthCapUsd: number;
  remainingMonthUsd: number;
  todayCount: number;
  dailyCap: number;
  remainingToday: number;
  walletUsd: number | null;
  currency: string | null;
}

async function spendThisPeriod(): Promise<{ monthSpent: number; todayCount: number }> {
  const db = createAdminClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const { data, error } = await db
    .from("video_renders")
    .select("cost_usd,created_at")
    .gte("created_at", monthStart);
  if (error) throw new Error(error.message);
  let monthSpent = 0;
  let todayCount = 0;
  for (const r of data ?? []) {
    monthSpent += Number((r as { cost_usd: number }).cost_usd) || 0;
    if ((r as { created_at: string }).created_at >= dayStart) todayCount++;
  }
  return { monthSpent, todayCount };
}

export async function budgetStatus(): Promise<BudgetStatus> {
  const { monthSpent, todayCount } = await spendThisPeriod();
  let walletUsd: number | null = null;
  let currency: string | null = null;
  try {
    const w = await getWallet();
    walletUsd = w.balance;
    currency = w.currency;
  } catch {
    /* wallet check is best-effort; the count/USD caps still apply */
  }
  return {
    monthSpentUsd: monthSpent,
    monthCapUsd: MONTHLY_USD_CAP,
    remainingMonthUsd: Math.max(0, MONTHLY_USD_CAP - monthSpent),
    todayCount,
    dailyCap: DAILY_RENDER_CAP,
    remainingToday: Math.max(0, DAILY_RENDER_CAP - todayCount),
    walletUsd,
    currency,
  };
}

// Throws (blocking the render) if it would exceed ANY limit. Call before spend.
export async function assertWithinBudget(estCostUsd: number): Promise<void> {
  const s = await budgetStatus();
  if (s.todayCount >= s.dailyCap) {
    throw new Error(`HeyGen daily render cap reached (${s.dailyCap}/day)`);
  }
  if (s.monthSpentUsd + estCostUsd > s.monthCapUsd) {
    throw new Error(
      `HeyGen monthly budget would be exceeded ($${s.monthCapUsd} cap, $${s.monthSpentUsd.toFixed(2)} spent)`,
    );
  }
  if (s.walletUsd != null && estCostUsd > s.walletUsd) {
    throw new Error(`HeyGen wallet too low ($${s.walletUsd.toFixed(2)} left)`);
  }
}

export async function recordRender(r: {
  externalId?: string;
  agent?: string;
  kind?: string;
  seconds?: number;
  costUsd: number;
  status?: string;
}): Promise<void> {
  const db = createAdminClient();
  const { error } = await db.from("video_renders").insert({
    external_id: r.externalId ?? null,
    agent: r.agent ?? null,
    kind: r.kind ?? null,
    seconds: r.seconds ?? null,
    cost_usd: r.costUsd,
    status: r.status ?? "queued",
  });
  if (error) throw new Error(error.message);
}
