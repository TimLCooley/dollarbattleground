import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

// "Share my path" (Tim, 2026-10-20): a link to your exact layout for a day.
// It never spoils anything — the layout is only handed to someone who has
// already posted their own score for that day.

async function me() {
  const { data: u } = await (await createClient()).auth.getUser();
  return u.user && !u.user.is_anonymous ? u.user : null;
}

// POST {day} — your path link for that day (one per player per day).
export async function POST(req: Request) {
  const user = await me();
  if (!user) return NextResponse.json({ error: "Log in to share your path." }, { status: 401 });
  const { day } = (await req.json().catch(() => ({}))) as { day?: number };
  if (!Number.isInteger(day)) return NextResponse.json({ error: "no such day" }, { status: 400 });
  const db = createAdminClient();
  const { data: score } = await db.from("commander_scores").select("day").eq("day", day!).eq("user_id", user.id).maybeSingle();
  if (!score) return NextResponse.json({ error: "Attack first — then you can share your path." }, { status: 400 });
  const { data: have } = await db.from("commander_shares").select("id").eq("day", day!).eq("user_id", user.id).maybeSingle();
  if (have) return NextResponse.json({ id: have.id });
  const id = randomBytes(6).toString("base64url");
  const { error } = await db.from("commander_shares").insert({ id, day, user_id: user.id });
  if (error) {
    // a second tab got there first — use theirs
    const { data: again } = await db.from("commander_shares").select("id").eq("day", day!).eq("user_id", user.id).maybeSingle();
    if (again) return NextResponse.json({ id: again.id });
    return NextResponse.json({ error: "Couldn't make the link — try again." }, { status: 500 });
  }
  return NextResponse.json({ id });
}

// GET ?id= — the shared path, or {locked} until you've played that day.
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[A-Za-z0-9_-]{4,20}$/.test(id)) return NextResponse.json({ error: "no such path" }, { status: 404 });
  const db = createAdminClient();
  const { data: share } = await db.from("commander_shares").select("day,user_id").eq("id", id).maybeSingle();
  if (!share) return NextResponse.json({ error: "no such path" }, { status: 404 });
  const user = await me();
  const mine = user?.id === share.user_id;
  const played = user
    ? !!(await db.from("commander_scores").select("day").eq("day", share.day).eq("user_id", user.id).maybeSingle()).data
    : false;
  if (!played && !mine) return NextResponse.json({ day: share.day, locked: true });
  const { data: theirs } = await db
    .from("commander_scores")
    .select("score,placements")
    .eq("day", share.day)
    .eq("user_id", share.user_id)
    .maybeSingle();
  if (!theirs) return NextResponse.json({ error: "no such path" }, { status: 404 });
  return NextResponse.json({ day: share.day, locked: false, mine, score: theirs.score, placements: theirs.placements });
}
