import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { isHeygenConfigured } from "@/lib/heygen";
import { budgetStatus } from "@/lib/heygen-budget";

// Admin: HeyGen wallet + render-budget status for the command center
// ("$12.40 of $15 left · 6 of 20 renders today"). Read-only, spends nothing.
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isHeygenConfigured()) {
    return NextResponse.json({ configured: false });
  }
  try {
    return NextResponse.json({ configured: true, budget: await budgetStatus() });
  } catch (e) {
    // Likely the video_renders migration isn't applied yet — surface it, don't crash.
    return NextResponse.json({
      configured: true,
      error: e instanceof Error ? e.message : "budget status failed",
    });
  }
}
