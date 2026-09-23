import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { postTweet, type Faction } from "@/lib/x";

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as {
    faction?: unknown;
    text?: unknown;
  } | null;
  const faction = body?.faction;
  const text = body?.text;
  if ((faction !== "red" && faction !== "blue") || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  try {
    const tweet = await postTweet(faction as Faction, text.trim());
    return NextResponse.json({ ok: true, id: tweet.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
