import { NextResponse } from "next/server";
import crypto from "crypto";
import { sendEmail } from "@/lib/email";

// Resend Inbound → Gmail forwarder.
//
// Flow: mail sent to the receiving (sub)domain is caught by Resend, which POSTs
// an `email.received` webhook here (METADATA ONLY). We verify the Svix signature,
// fetch the full body via the Received Emails API, then re-send it to the owner
// via Resend from our verified domain. Set up in the Resend dashboard:
//   1. Add + verify a receiving (sub)domain, add its MX record.
//   2. Create a webhook for `email.received` → this URL; copy its signing secret.
//   3. A full-access API key is needed to read the received email body.
// Env: RESEND_WEBHOOK_SECRET (whsec_…), RESEND_INBOUND_API_KEY (full-access key;
// falls back to RESEND_API_KEY, but the send-only key can't read inbound),
// FORWARD_INBOUND_TO (destination inbox).

const FORWARD_TO = process.env.FORWARD_INBOUND_TO || "timlcooley+dbg@gmail.com";
// Prod stored the Svix secret as INBOUND_WEBHOOK_SECRET; accept either name.
const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET || process.env.INBOUND_WEBHOOK_SECRET;
const READ_KEY = process.env.RESEND_INBOUND_API_KEY || process.env.RESEND_API_KEY;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
// "Name <a@b.com>" -> "a@b.com"
function extractEmail(s: string): string | undefined {
  const m = s.match(/<([^>]+)>/) || s.match(/([^\s@]+@[^\s@]+\.[^\s@]+)/);
  return m ? m[1].trim() : undefined;
}

// Verify a Resend (Svix) webhook signature over the RAW body.
function verifySignature(raw: string, headers: Headers): boolean {
  if (!WEBHOOK_SECRET) return false;
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;
  // Reject stale timestamps (>5 min) to blunt replay attacks.
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;

  const secret = Buffer.from(WEBHOOK_SECRET.replace(/^whsec_/, ""), "base64");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${id}.${ts}.${raw}`)
    .digest("base64");
  // Header is a space-separated list of "v1,<sig>" entries.
  return sigHeader.split(" ").some((part) => {
    const sig = part.split(",")[1];
    if (!sig) return false;
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

interface ReceivedEmail {
  from?: string;
  to?: string[] | string;
  subject?: string;
  html?: string;
  text?: string;
}

export async function POST(req: Request) {
  const raw = await req.text();

  if (!verifySignature(raw, req.headers)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let event: { type?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  // Ignore anything that isn't an inbound email (ack so Resend doesn't retry).
  if (event.type !== "email.received" || !event.data?.email_id) {
    return NextResponse.json({ ok: true, ignored: event.type ?? "unknown" });
  }

  try {
    if (!READ_KEY) throw new Error("no inbound API key configured");
    // Webhook is metadata-only — fetch the full body from the Received API.
    const res = await fetch(
      `https://api.resend.com/emails/receiving/${event.data.email_id}`,
      { headers: { Authorization: `Bearer ${READ_KEY}` } },
    );
    if (!res.ok) throw new Error(`retrieve ${res.status}: ${await res.text()}`);
    const mail = (await res.json()) as ReceivedEmail;

    const from = mail.from ?? "unknown sender";
    const to = Array.isArray(mail.to) ? mail.to.join(", ") : (mail.to ?? "");
    const subject = mail.subject ?? "(no subject)";
    const text = mail.text ?? "";
    const html = mail.html ?? "";

    const meta = `<hr style="margin-top:20px;border:none;border-top:1px solid #ddd"><p style="color:#888;font-size:12px">Forwarded by Dollar Battleground · to: ${escapeHtml(to)} · from: ${escapeHtml(from)}</p>`;
    const bodyHtml =
      (html || `<pre style="white-space:pre-wrap">${escapeHtml(text)}</pre>`) + meta;

    const result = await sendEmail({
      to: FORWARD_TO,
      subject,
      html: bodyHtml,
      text: text || undefined,
      replyTo: extractEmail(from),
    });
    if (!result.ok) console.error("inbound forward failed:", result.error);
  } catch (e) {
    // Always 200 so Resend doesn't retry-storm; log the failure server-side.
    console.error("inbound handler error:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true });
}
