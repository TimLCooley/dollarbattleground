import "server-only";

// Transactional email through Resend. Server-only: this reads the secret API
// key and must never be imported into client code. The key lives in env
// (RESEND_API_KEY) — never hard-code it. The "from" address must be on a domain
// verified in Resend (RESEND_FROM_EMAIL), or sends are rejected.

const KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
const FROM_NAME = process.env.RESEND_FROM_NAME || "CommanderBG";
// While a new sending domain is still verifying in Resend, a send it rejects for
// that reason goes out from the previous domain instead (2026-10-17 move to
// commanderbg.com) — nobody misses an email during the switch.
const FALLBACK_FROM = process.env.RESEND_FALLBACK_FROM || "noreply@dollarbattleground.com";

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

// Every email carries the website, visibly — a clickable line at the very
// bottom — whatever template sent it (Tim, 2026-10-09).
const SITE_FOOTER = `<div style="font-family:system-ui,Arial,sans-serif;text-align:center;padding:14px 0 6px;font-size:14px"><a href="https://commanderbg.com" style="color:#f2c14e;font-weight:700;text-decoration:none;letter-spacing:.5px">commanderbg.com</a></div>`;
function withSite(html: string): string {
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${SITE_FOOTER}</body>`) : `${html}${SITE_FOOTER}`;
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
    const send = (from: string) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${FROM_NAME} <${from}>`,
          to: opts.to,
          subject: opts.subject,
          html: withSite(opts.html),
          text: `${opts.text ?? stripHtml(opts.html)}\n\ncommanderbg.com`,
          ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        }),
      });

    let res = await send(FROM_EMAIL);
    if (!res.ok && FALLBACK_FROM && FALLBACK_FROM !== FROM_EMAIL && (res.status === 403 || res.status === 422)) {
      const why = await res.clone().text().catch(() => "");
      if (/verif|domain|authori[sz]ed|not allowed/i.test(why)) res = await send(FALLBACK_FROM);
    }

    if (!res.ok) {
      let msg = `send failed (${res.status})`;
      try {
        const body = (await res.json()) as { message?: string; error?: string };
        msg = body.message ?? body.error ?? msg;
      } catch {
        /* non-JSON error body */
      }
      // the sender line, as sent (no secrets) — Resend rejects a malformed one
      console.error("email send failed:", msg, JSON.stringify({ name: FROM_NAME, email: FROM_EMAIL }));
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
