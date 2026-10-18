import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

// Enlist straight from Commander: a just-verified player gets their free first
// Battleground square placed for them (open ground first, else enemy ground) on
// the side they played the puzzle as — so their score can post without leaving.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user || u.user.is_anonymous) return NextResponse.json({ error: "Sign in with your email first." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { side?: string };
  const want = body.side === "red" ? "red" : "blue";
  const db = createAdminClient();
  const { data: fc } = await db.from("free_claims").select("side").eq("user_id", u.user.id).maybeSingle();
  if (fc?.side) return NextResponse.json({ ok: true, side: fc.side, already: true });
  const { data: open } = await db.from("tiles").select("x,y").is("owner_id", null).limit(400);
  let pool = (open ?? []) as { x: number; y: number }[];
  if (!pool.length) {
    const { data: enemy } = await db.from("tiles").select("x,y").neq("team", want).limit(400);
    pool = (enemy ?? []) as { x: number; y: number }[];
  }
  if (!pool.length) return NextResponse.json({ error: "The map is full of your color already — you're in!" }, { status: 409 });
  const t = pool[Math.floor(Math.random() * pool.length)];
  const { error } = await supabase.rpc("claim_free_tile", { p_x: t.x, p_y: t.y, p_team: want });
  if (error) {
    const m = error.message.toLowerCase();
    const msg = /already|enlisted|inbox/.test(m)
      ? "That email is already enlisted — tap “Already enlisted? Log in” instead."
      : "We couldn't finish enlisting you. Try again in a moment, or email support@commanderbg.com.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true, side: want, x: t.x, y: t.y });
}
