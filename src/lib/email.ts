import "server-only";

// Transactional email through Resend. Server-only: this reads the secret API
// key and must never be imported into client code. The key lives in env
// (RESEND_API_KEY) — never hard-code it. The "from" address must be on a domain
// verified in Resend (RESEND_FROM_EMAIL), or sends are rejected.

const KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
const FROM_NAME = process.env.RESEND_FROM_NAME || "Dollar Battleground";

export interface SendResult {
  ok: boolean;
  error?: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}): Promise<SendResult> {
  if (!KEY) return { ok: false, error: "RESEND_API_KEY is not set" };
  if (!FROM_EMAIL)
    return {
      ok: false,
      error:
        "RESEND_FROM_EMAIL is not set — verify a sending domain in Resend first",
    };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        text: opts.text ?? stripHtml(opts.html),
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      }),
    });

    if (!res.ok) {
      let msg = `send failed (${res.status})`;
      try {
        const body = (await res.json()) as { message?: string; error?: string };
        msg = body.message ?? body.error ?? msg;
      } catch {
        /* non-JSON error body */
      }
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

export function isEmailConfigured(): boolean {
  return Boolean(KEY && FROM_EMAIL);
}
