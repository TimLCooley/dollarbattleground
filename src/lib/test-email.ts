// Dev-only testing shortcut. Any email starting with "aaa" routes to the owner
// inbox, so multiple distinct test identities can all be exercised from one
// mailbox:
//   "aaa"      -> timlcooley@gmail.com          (exact = super-admin trigger)
//   "aaa1"     -> timlcooley+aaa1@gmail.com      (distinct account, same inbox)
//   "aaabob"   -> timlcooley+aaabob@gmail.com    (distinct account, same inbox)
// Gmail sub-addressing (+tag) makes each a separate address (separate Supabase
// user / player) that still delivers to timlcooley@gmail.com.
//
// Guarded to non-production — in a prod build this is a no-op and "aaa…" is
// treated as the invalid email it is.

const TEST_TARGET = "timlcooley@gmail.com";

export function resolveTestEmail(input: string): string {
  const trimmed = (input || "").trim();
  const v = trimmed.toLowerCase();

  if (process.env.NODE_ENV !== "production" && v.startsWith("aaa")) {
    if (v === "aaa") return TEST_TARGET; // exact match keeps super-admin
    const [name, domain] = TEST_TARGET.split("@");
    const tag = v.replace(/[^a-z0-9]/g, ""); // safe local-part tag
    return `${name}+${tag}@${domain}`;
  }

  return trimmed;
}
