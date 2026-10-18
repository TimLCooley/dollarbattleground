import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

// OLD domain → park this browser's session + bg_* data under a one-time code.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { local?: Record<string, string>; to?: string };
  const { data } = await (await createClient()).auth.getSession();
  const s = data.session;
  // only our own keys, size-capped
  const local: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.local ?? {})) if (/^bg_[\w-]{1,60}$/.test(k) && typeof v === "string" && v.length < 20000) local[k] = v;
  const to = typeof body.to === "string" && body.to.startsWith("/") && !body.to.startsWith("//") ? body.to.slice(0, 500) : "/";
  const code = randomBytes(24).toString("base64url");
  const { error } = await createAdminClient()
    .from("domain_handoffs")
    .insert({ code, access_token: s?.access_token ?? null, refresh_token: s?.refresh_token ?? null, local, to_path: to });
  if (error) return NextResponse.json({ error: "handoff failed" }, { status: 500 });
  return NextResponse.json({ code });
}
