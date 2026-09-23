import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

// Attribution redirect. Recruiter posts link here (dollarbattleground.com/r/<id>);
// we log the click on that post, then land the visitor on /red or /blue — the
// perspective screens that lock the recruit's side. Impressions → measured VISITS.

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const pid = Number(id);
  const home = new URL("/", req.url);
  if (Number.isFinite(pid) && pid > 0) {
    try {
      const db = createAdminClient();
      const { data } = await db.from("agent_posts").select("faction,x_account").eq("id", pid).single();
      await db.rpc("bump_post_clicks", { pid });
      const side = data?.faction === "blue" || data?.x_account === "blue" ? "blue" : data?.faction === "red" || data?.x_account === "red" ? "red" : null;
      if (side) home.pathname = `/${side}`;
      home.searchParams.set("ref", `p${pid}`);
    } catch {
      /* still redirect */
    }
  }
  return NextResponse.redirect(home, 302);
}
