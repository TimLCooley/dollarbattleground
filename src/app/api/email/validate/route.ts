import { NextResponse } from "next/server";
import { validateEmail } from "@/lib/email-validate";
import { createAdminClient } from "@/utils/supabase/admin";

// POST { email } -> { ok, reason?, suggestion? }. Used at capture (claim tile)
// to reject junk/fake emails before we store them. Ownership is proven later
// via the login OTP code, not here.
export async function POST(req: Request) {
  let email = "";
  try {
    const body = (await req.json()) as { email?: string };
    email = body.email ?? "";
  } catch {
    /* no body */
  }
  const result = await validateEmail(email);
  if (!result.ok) return NextResponse.json(result);
  // One inbox, one player: tim+2@gmail.com / t.i.m@gmail.com are tim@gmail.com.
  // Only blocks a NEW address for an inbox that already has a player; signing
  // in again with the exact original address is fine.
  try {
    const db = createAdminClient();
    const [{ data: taken }, { data: exact }] = await Promise.all([
      db.rpc("inbox_already_enlisted", { p_email: email }),
      db.rpc("emails_for_lookup_exact", { p_email: email }).then((r) => r, () => ({ data: null })),
    ]);
    if (taken === true && !exact) {
      return NextResponse.json({ ok: false, reason: "That inbox already has a player. Sign in with the address you first used (no +extras or extra dots)." });
    }
  } catch {
    /* the server-side claim check still applies */
  }
  return NextResponse.json(result);
}
