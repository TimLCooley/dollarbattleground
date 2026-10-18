import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

// NEW domain ← claim a one-time code (single use, 2-minute window): sign this
// browser back in here and return its saved bg_* data and where it was going.
export async function POST(req: Request) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  if (!code || !/^[\w-]{20,64}$/.test(code)) return NextResponse.json({ error: "bad code" }, { status: 400 });
  const { data } = await createAdminClient().rpc("claim_domain_handoff", { p_code: code });
  const row = (data as { access_token: string | null; refresh_token: string | null; local: Record<string, string> | null; to_path: string }[] | null)?.[0];
  if (!row) return NextResponse.json({ error: "expired" }, { status: 410 });
  let signedIn = false;
  if (row.refresh_token) {
    // sets the auth cookies on THIS domain
    const { error } = await (await createClient()).auth.setSession({ access_token: row.access_token ?? "", refresh_token: row.refresh_token });
    signedIn = !error;
  }
  return NextResponse.json({ signedIn, local: row.local ?? {}, to: row.to_path || "/" });
}
