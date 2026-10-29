import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

// POST {anonToken} — right after a guest enlists: move the scores they posted
// as a guest (their anonymous session) to their new account. The anonymous
// session's own token proves those scores were theirs. Days the account
// already has a score for are left alone.
export async function POST(req: Request) {
  const { data: u } = await (await createClient()).auth.getUser();
  const user = u.user && !u.user.is_anonymous ? u.user : null;
  if (!user) return NextResponse.json({ error: "log in first" }, { status: 401 });
  const { anonToken } = (await req.json().catch(() => ({}))) as { anonToken?: string };
  if (!anonToken) return NextResponse.json({ moved: 0 });
  const db = createAdminClient();
  const { data: a } = await db.auth.getUser(anonToken);
  const guest = a.user;
  if (!guest || !guest.is_anonymous || guest.id === user.id) return NextResponse.json({ moved: 0 });
  const [{ data: theirs }, { data: mine }] = await Promise.all([
    db.from("commander_scores").select("day").eq("user_id", guest.id),
    db.from("commander_scores").select("day").eq("user_id", user.id),
  ]);
  const have = new Set(((mine ?? []) as { day: number }[]).map((r) => r.day));
  const days = ((theirs ?? []) as { day: number }[]).map((r) => r.day).filter((d) => !have.has(d));
  if (!days.length) return NextResponse.json({ moved: 0 });
  const { error } = await db.from("commander_scores").update({ user_id: user.id }).eq("user_id", guest.id).in("day", days);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ moved: days.length });
}
