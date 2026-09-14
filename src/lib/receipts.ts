// Local ledger of every paid action. This is the single chokepoint the payment
// flow records through, so when Stripe is wired up the confirm step calls Stripe
// first and then records the returned charge here (and can fire an email receipt
// off the same record). Until then it's a play-money log kept in localStorage —
// but it is always fully visible to the player at /receipts (nothing hidden).

export type ActionKind = "flip" | "x" | "strike";

export interface Receipt {
  id: string;
  ts: string; // ISO timestamp
  amount: number; // USD
  kind: ActionKind;
  action: string; // human label, e.g. "Take Position"
  tiles: number; // tiles affected
  side: "red" | "blue";
}

const RKEY = "bg_receipts_v1";

export const ACTION_LABEL: Record<ActionKind, string> = {
  flip: "Take Position",
  x: "X-Strike",
  strike: "Airstrike",
};

export function getReceipts(): Receipt[] {
  try {
    const raw = localStorage.getItem(RKEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Receipt[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function addReceipt(input: {
  amount: number;
  kind: ActionKind;
  tiles: number;
  side: "red" | "blue";
}): Receipt {
  const receipt: Receipt = {
    id:
      (globalThis.crypto?.randomUUID?.() as string) ??
      `r_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ts: new Date().toISOString(),
    amount: input.amount,
    kind: input.kind,
    action: ACTION_LABEL[input.kind],
    tiles: input.tiles,
    side: input.side,
  };
  try {
    const list = getReceipts();
    list.unshift(receipt); // newest first
    localStorage.setItem(RKEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return receipt;
}

export function totalSpent(): number {
  return getReceipts().reduce((sum, r) => sum + r.amount, 0);
}
