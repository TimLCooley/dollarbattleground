// Sign-in errors in plain words, always with what to do next — never a raw
// "Error sending magic link email" (Tim: "I hate an error with no solution").
export function friendlyAuthError(raw: string | null | undefined, stage: "send" | "verify" | "network"): string {
  const m = (raw ?? "").toLowerCase();
  if (stage === "network" || /fetch|network|failed to fetch|load failed/.test(m))
    return "We couldn't reach the server. Check your connection, then tap the button again.";
  if (/rate|too many|security purposes|after \d+ seconds|seconds/.test(m))
    return "Too many tries in a row. Wait about a minute, then tap the button again.";
  if (stage === "verify") {
    if (/expired|invalid|otp|token|code/.test(m))
      return "That code didn't work — it may have expired. Tap “resend my code” below for a fresh one.";
    return "We couldn't check that code. Tap “resend my code” below and try the new one.";
  }
  if (/invalid.*email|email.*invalid|unable to validate email/.test(m))
    return "That email doesn't look right — check it for typos and try again.";
  if (/signups not allowed|not allowed/.test(m))
    return "We couldn't sign that email in. Email support@commanderbg.com and we'll get you set up.";
  // sending failed on our side (mail provider hiccup)
  return "We couldn't send your code just now. Tap “Send my code” again in a minute — still nothing? Email support@commanderbg.com and we'll get you in.";
}
