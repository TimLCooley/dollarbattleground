import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { intelBrief } from "@/lib/intel";
import { getOrders, planOrders, setOrders, type GeneralOrders } from "@/lib/general";
import { campaignDaysLeft, DEFAULT_GOAL } from "@/lib/autopilot";

// The command layer's API: the Intel brief + the General's standing orders.
// GET reads both; POST lets the Commander move the slider / edit directives,
// or asks the General to re-plan from live data.

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = createAdminClient();
  const [orders, brief] = await Promise.all([getOrders(db), intelBrief(db)]);
  return NextResponse.json({ orders, brief });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = createAdminClient();
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    patch?: Partial<GeneralOrders>;
    goal?: string;
  };
  try {
    if (body.action === "set" && body.patch) {
      return NextResponse.json({ orders: await setOrders(db, body.patch) });
    }
    if (body.action === "unlock") {
      return NextResponse.json({ orders: await setOrders(db, { pct_locked_by_commander: false }) });
    }
    if (body.action === "plan") {
      const [brief, daysLeft] = await Promise.all([intelBrief(db), campaignDaysLeft(db)]);
      const orders = await planOrders(db, brief, body.goal?.trim() || DEFAULT_GOAL, daysLeft);
      return NextResponse.json({ orders, brief });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
