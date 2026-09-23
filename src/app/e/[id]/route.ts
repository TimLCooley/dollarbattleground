import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

// Email click attribution. Every dispatch's CTA points here; we count the click
// and send the reader to the target stored on the log row (their side's board,
// with the lost tile pre-aimed for takeover alerts).

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const eid = Number(id);
  let target = new URL("/", req.url);
  if (Number.isFinite(eid) && eid > 0) {
    try {
      const db = createAdminClient();
      const { data } = await db.from("email_log").select("meta").eq("id", eid).single();
      await db.rpc("bump_email_clicks", { eid });
      const t = (data as { meta?: { target?: string } } | null)?.meta?.target;
      if (t && t.startsWith("https://dollarbattleground.com/")) target = new URL(t);
    } catch {
      /* still redirect */
    }
  }
  target.searchParams.set("ref", `e${eid}`);
  return NextResponse.redirect(target, 302);
}
