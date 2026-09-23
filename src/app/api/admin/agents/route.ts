import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/utils/supabase/admin";

// Agent management for the admin panel: list agents + recent events (GET),
// create/update an agent (POST, upsert by slug), remove one (DELETE ?id=).

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = createAdminClient();
  const [{ data: agents }, { data: events }] = await Promise.all([
    db.from("agents").select("*").order("created_at", { ascending: true }),
    db
      .from("agent_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  return NextResponse.json({ agents: agents ?? [], events: events ?? [] });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    /* no body */
  }
  const slug = String(body.slug ?? "").trim();
  const name = String(body.name ?? "").trim();
  if (!slug || !/^[a-z0-9_]+$/.test(slug)) {
    return NextResponse.json(
      { error: "slug required (lowercase letters, digits, underscore)" },
      { status: 400 },
    );
  }
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const row = {
    slug,
    name,
    role: String(body.role ?? "custom"),
    personality: body.personality == null ? null : String(body.personality),
    avatar: body.avatar == null ? null : String(body.avatar),
    color: body.color == null ? null : String(body.color),
    active: body.active === undefined ? true : Boolean(body.active),
    config: (body.config as object) ?? {},
    updated_at: new Date().toISOString(),
  };

  const db = createAdminClient();
  const { data, error } = await db
    .from("agents")
    .upsert(row, { onConflict: "slug" })
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ agent: data });
}

export async function DELETE(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const db = createAdminClient();
  const { error } = await db.from("agents").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
