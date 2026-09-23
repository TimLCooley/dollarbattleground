import "server-only";
import { promises as dns } from "dns";

// Capture-time email validation: reject obvious junk without OTP friction.
// Layers: syntax → disposable-domain block → typo nudge → MX lookup (does the
// domain actually accept mail?). Ownership proof (that the inbox is real and
// theirs) happens separately via the login OTP code — this is the fast gate.

export interface EmailCheck {
  ok: boolean;
  reason?: string; // why it was rejected (shown to the user)
  suggestion?: string; // corrected email, e.g. typo fix
}

// Throwaway / disposable inbox providers. Not exhaustive, but covers the ones
// people reach for. Extend freely.
const DISPOSABLE = new Set([
  "mailinator.com",
  "10minutemail.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "sharklasers.com",
  "trashmail.com",
  "temp-mail.org",
  "tempmail.com",
  "throwawaymail.com",
  "yopmail.com",
  "getnada.com",
  "dispostable.com",
  "maildrop.cc",
  "fakeinbox.com",
  "mailnesia.com",
  "mohmal.com",
  "emailondeck.com",
  "spam4.me",
  "grr.la",
  "tempinbox.com",
  "moakt.com",
  "mailcatch.com",
  "inboxbear.com",
  "tempmailo.com",
  "burnermail.io",
]);

// Popular real domains, for typo suggestions ("gmial.com" → "gmail.com").
const COMMON = [
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "live.com",
  "msn.com",
  "me.com",
  "comcast.net",
];

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

function suggestDomain(domain: string): string | null {
  if (COMMON.includes(domain)) return null;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const c of COMMON) {
    const dist = levenshtein(domain, c);
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }
  // Only suggest for a close miss (1–2 edits), not a genuinely different domain.
  return best && bestDist > 0 && bestDist <= 2 ? best : null;
}

export async function validateEmail(raw: string): Promise<EmailCheck> {
  const email = (raw || "").trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, reason: "That doesn't look like a valid email address." };
  }

  const domain = email.slice(email.lastIndexOf("@") + 1);

  if (DISPOSABLE.has(domain)) {
    return {
      ok: false,
      reason: "Temporary or disposable email addresses aren't allowed.",
    };
  }

  const suggestedDomain = suggestDomain(domain);
  const fixEmail = (d: string) => email.slice(0, email.lastIndexOf("@") + 1) + d;

  // Does the domain actually accept mail? (No MX = can't receive.)
  try {
    const mx = await dns.resolveMx(domain);
    const hasMx = Array.isArray(mx) && mx.some((r) => r.exchange);
    if (!hasMx) {
      return suggestedDomain
        ? {
            ok: false,
            reason: `Did you mean @${suggestedDomain}?`,
            suggestion: fixEmail(suggestedDomain),
          }
        : { ok: false, reason: "That email domain can't receive mail." };
    }
  } catch {
    return suggestedDomain
      ? {
          ok: false,
          reason: `Did you mean @${suggestedDomain}?`,
          suggestion: fixEmail(suggestedDomain),
        }
      : { ok: false, reason: "That email domain can't receive mail." };
  }

  // Valid + deliverable. If it's a near-miss of a common domain, pass it but
  // hand back a soft suggestion the UI can offer.
  return suggestedDomain
    ? { ok: true, suggestion: fixEmail(suggestedDomain) }
    : { ok: true };
}
