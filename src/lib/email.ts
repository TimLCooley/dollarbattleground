import "server-only";
import sgMail from "@sendgrid/mail";

// Transactional email through SendGrid. Server-only: this reads the secret API
// key and must never be imported into client code. The key lives in env
// (SENDGRID_API_KEY) — never hard-code it. A verified sender identity
// (SENDGRID_FROM_EMAIL) is required by SendGrid or sends are rejected.

const KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL;
const FROM_NAME = process.env.SENDGRID_FROM_NAME || "Dollar Battleground";

if (KEY) sgMail.setApiKey(KEY);

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
}): Promise<SendResult> {
  if (!KEY) return { ok: false, error: "SENDGRID_API_KEY is not set" };
  if (!FROM_EMAIL)
    return {
      ok: false,
      error:
        "SENDGRID_FROM_EMAIL is not set — verify a sender identity in SendGrid first",
    };

  try {
    await sgMail.send({
      to: opts.to,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject: opts.subject,
      html: opts.html,
      text: opts.text ?? stripHtml(opts.html),
    });
    return { ok: true };
  } catch (e: unknown) {
    let msg = "send failed";
    if (typeof e === "object" && e !== null) {
      const err = e as {
        response?: { body?: { errors?: Array<{ message?: string }> } };
        message?: string;
      };
      msg = err.response?.body?.errors?.[0]?.message ?? err.message ?? msg;
    }
    return { ok: false, error: msg };
  }
}

export function isEmailConfigured(): boolean {
  return Boolean(KEY && FROM_EMAIL);
}
