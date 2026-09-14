import { NextResponse } from "next/server";
import { validateEmail } from "@/lib/email-validate";

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
  return NextResponse.json(result);
}
