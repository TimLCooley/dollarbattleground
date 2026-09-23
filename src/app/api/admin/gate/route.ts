import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";
import { closeGates, getGate, openGates } from "@/lib/gate";

// The gate, by hand. The timer opens it on its own; this is the override —
// open early, or close it again if something's wrong. Opening starts the
// launch signal (the tick drains the list in batches).

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await getGate(createAdminClient()));
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = createAdminClient();
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action === "open") return NextResponse.json(await openGates(db, "admin"));
  if (body.action === "close") return NextResponse.json(await closeGates(db));
  return NextResponse.json({ error: "action?" }, { status: 400 });
}
