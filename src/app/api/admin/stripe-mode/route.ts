import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import {
  getStripeMode,
  setStripeMode,
  liveConfigured,
} from "@/lib/stripe-mode";

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    mode: await getStripeMode(),
    liveConfigured: liveConfigured(),
  });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let mode = "";
  try {
    const body = (await req.json()) as { mode?: string };
    mode = body.mode ?? "";
  } catch {
    /* no body */
  }
  if (mode !== "test" && mode !== "live") {
    return NextResponse.json({ error: "mode must be 'test' or 'live'" }, { status: 400 });
  }
  if (mode === "live" && !liveConfigured()) {
    return NextResponse.json(
      { error: "Live keys not configured (set STRIPE_SECRET_KEY_LIVE + NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_LIVE)" },
      { status: 400 },
    );
  }

  await setStripeMode(mode);
  return NextResponse.json({ mode, liveConfigured: liveConfigured() });
}
