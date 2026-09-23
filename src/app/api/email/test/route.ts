import { NextResponse } from "next/server";
import { sendEmail, isEmailConfigured } from "@/lib/email";

// Dev-only email test harness. POST { "to": "you@email.com" } to send a sample
// dispatch. Guarded to non-production so it can never act as an open relay once
// deployed. Real transactional sends (receipts, dispatches) will call sendEmail
// from their own server actions/routes, not this endpoint.

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  let to = "";
  try {
    const body = (await req.json()) as { to?: string };
    to = (body.to ?? "").trim();
  } catch {
    /* no body */
  }
  if (!/\S+@\S+\.\S+/.test(to)) {
    return NextResponse.json(
      { error: "Provide a valid { to } email" },
      { status: 400 },
    );
  }

  if (!isEmailConfigured()) {
    return NextResponse.json(
      { error: "Email not configured (set RESEND_API_KEY + RESEND_FROM_EMAIL)" },
      { status: 500 },
    );
  }

  const html = `
    <div style="font-family:system-ui,Arial,sans-serif;background:#124f2b;padding:24px;color:#f6efdb">
      <div style="max-width:480px;margin:0 auto;background:#155f33;border:3px solid #0c3c21;padding:24px">
        <h1 style="margin:0 0 8px;font-size:20px;letter-spacing:1px;color:#f2c14e">$ DOLLAR BATTLEGROUND</h1>
        <p style="margin:0 0 12px;font-size:16px">Field radio check, soldier.</p>
        <p style="margin:0 0 12px;font-size:15px;color:#efe4c4">
          If you're reading this, dispatches are wired up and coming through loud and clear.
        </p>
        <p style="margin:16px 0 0;font-size:12px;color:#efe4c4;opacity:.7">
          You can stand down from dispatches anytime in Settings.
        </p>
      </div>
    </div>`;

  const result = await sendEmail({
    to,
    subject: "Field radio check — Dollar Battleground",
    html,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true, to });
}
