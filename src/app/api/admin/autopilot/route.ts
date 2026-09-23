import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { getAutopilot, runAutopilot, setAutopilot, type AutopilotConfig } from "@/lib/autopilot";
import { getStripeMode } from "@/lib/stripe-mode";

// Admin control of the autopilot: read config + last tick, flip the kill
// switch / knobs, or force a tick right now.

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = createAdminClient();
  const { config, state } = await getAutopilot(db);
  return NextResponse.json({ config, state, stripeMode: await getStripeMode() });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = createAdminClient();
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    patch?: Partial<AutopilotConfig>;
  };
  try {
    if (body.action === "set" && body.patch) {
      const config = await setAutopilot(db, body.patch);
      return NextResponse.json({ config });
    }
    if (body.action === "run") {
      // Force a tick even while the switch is OFF (still respects the Stripe gate).
      const state = await runAutopilot(db, { force: true });
      return NextResponse.json({ state });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "failed" }, { status: 500 });
  }
}
