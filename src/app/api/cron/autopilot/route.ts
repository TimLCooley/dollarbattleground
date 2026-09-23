import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { runAutopilot } from "@/lib/autopilot";

// The autopilot tick. Hit every 10 minutes by pg_cron (Authorization: Bearer
// CRON_SECRET); an admin session may also trigger it. Publishes due posts that
// weren't denied, tops up each team's queue, refreshes X metrics hourly.

export const dynamic = "force-dynamic";
export const maxDuration = 120; // a video upload + tweet can take a while

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const viaCron = Boolean(secret) && auth === `Bearer ${secret}`;
  if (!viaCron && !(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const result = await runAutopilot(createAdminClient());
  return NextResponse.json(result);
}
