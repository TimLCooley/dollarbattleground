import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";

// Campaign window (15-day recruiting push) + the $200K revenue goal. Stored in
// app_config so the countdown + goal show across the command center.
// app_config.value is a TEXT column — JSON goes in and out as a string.

const GOAL_KEY = "revenue_goal";
const CAMPAIGN_KEY = "campaign";

function parse<T>(raw: unknown): T | undefined {
  if (typeof raw !== "string") return (raw as T) ?? undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

async function read(db: ReturnType<typeof createAdminClient>) {
  const { data } = await db.from("app_config").select("key,value").in("key", [GOAL_KEY, CAMPAIGN_KEY]);
  const map = new Map((data ?? []).map((r) => [r.key, r.value]));
  const camp = parse<{ ends_at?: string; started_at?: string }>(map.get(CAMPAIGN_KEY));
  const goal = parse<{ usd?: number }>(map.get(GOAL_KEY))?.usd ?? 200000;
  const endsAt = camp?.ends_at ?? null;
  const daysLeft = endsAt ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000)) : null;
  return { endsAt, startedAt: camp?.started_at ?? null, daysLeft, goalUsd: goal };
}

async function write(db: ReturnType<typeof createAdminClient>, key: string, value: unknown, now: Date) {
  await db.from("app_config").upsert({ key, value: JSON.stringify(value), updated_at: now.toISOString() });
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await read(createAdminClient()));
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = createAdminClient();
  const body = (await req.json().catch(() => ({}))) as { action?: string; days?: number; usd?: number };
  const now = new Date();

  if (body.action === "start") {
    const days = body.days && body.days > 0 ? body.days : 15;
    const ends = new Date(now.getTime() + days * 86_400_000).toISOString();
    await write(db, CAMPAIGN_KEY, { started_at: now.toISOString(), ends_at: ends }, now);
  } else if (body.action === "stop") {
    await write(db, CAMPAIGN_KEY, {}, now);
  } else if (body.action === "goal") {
    await write(db, GOAL_KEY, { usd: body.usd ?? 200000 }, now);
  }
  return NextResponse.json(await read(db));
}
