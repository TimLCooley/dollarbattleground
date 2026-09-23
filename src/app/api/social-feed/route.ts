import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

// Public feed of what the Recruiter has ACTUALLY posted to X (status 'posted'),
// grouped by side. Read-only, only already-public tweet text — safe to expose.

export const revalidate = 30;

export async function GET() {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("agent_posts")
      .select("id,copy,x_account,external_id,posted_at")
      .eq("status", "posted")
      .order("posted_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);

    const red: unknown[] = [];
    const blue: unknown[] = [];
    for (const r of data ?? []) {
      const post = {
        id: r.id,
        body: r.copy,
        postedAt: r.posted_at,
        externalId: r.external_id,
      };
      (r.x_account === "blue" ? blue : red).push(post);
    }
    return NextResponse.json({ red, blue });
  } catch (e) {
    return NextResponse.json(
      { red: [], blue: [], error: e instanceof Error ? e.message : "failed" },
      { status: 200 },
    );
  }
}
