"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { friendlyAuthError } from "@/lib/auth-errors";
import { track } from "@/lib/track";
import { ResendCode } from "../resend-code";

// Enlist without leaving Commander: email → 6-digit code → your free first
// Battleground square is placed for you → back to the board you were on.
export function EnlistInline({ side, onDone, onBack }: { side: "red" | "blue"; onDone: () => void; onBack: () => void }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    const mail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setError("That email doesn't look right — check it for typos and try again.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const v = (await fetch("/api/email/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: mail }) }).then((r) => r.json())) as { ok: boolean; reason?: string };
      if (!v.ok) {
        setError(v.reason ?? "That email doesn't look right — check it for typos and try again.");
        return;
      }
      const { error: err } = await createClient().auth.signInWithOtp({ email: mail, options: { shouldCreateUser: true } });
      if (err) {
        setError(friendlyAuthError(err.message, "send"));
        return;
      }
      track("email_entered", { from: "commander" });
      setStep("code");
    } catch {
      setError(friendlyAuthError(null, "network"));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    const token = code.trim();
    if (!/^\d{6}$/.test(token)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      let err = (await supabase.auth.verifyOtp({ email: email.trim(), token, type: "email" })).error;
      if (err) err = (await supabase.auth.verifyOtp({ email: email.trim(), token, type: "signup" })).error;
      if (err) {
        setError(friendlyAuthError(err.message, "verify"));
        return;
      }
      track("code_verified", { from: "commander" });
      const r = await fetch("/api/commander/enlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ side }) });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setError(j.error ?? "We couldn't finish enlisting you. Try again in a moment, or email support@commanderbg.com.");
        return;
      }
      fetch("/api/email/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ takeover_alerts: true, reminders: true }) }).catch(() => {});
      onDone();
    } catch {
      setError(friendlyAuthError(null, "network"));
    } finally {
      setBusy(false);
    }
  }

  return step === "email" ? (
    <>
      <div className="ob-kicker">◆ ENLIST FREE ◆</div>
      <h2 className="ob-title">POST YOUR SCORE</h2>
      <p className="ob-body">Enter your email — we&apos;ll send a 6-digit code. You&apos;ll stay right here, and you get a free square on the Battleground too.</p>
      <input className="ob-input" type="email" placeholder="you@email.com" value={email} autoFocus onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }} onKeyDown={(e) => e.key === "Enter" && sendCode()} />
      {error && <p className="ct-error">{error}</p>}
      <button className="ob-btn" onClick={sendCode} disabled={busy}>{busy ? "SENDING…" : "SEND MY CODE →"}</button>
      <button className="ob-skip" onClick={onBack} disabled={busy}>‹ back</button>
    </>
  ) : (
    <>
      <div className="ob-kicker">◆ CONFIRM IT&apos;S YOU ◆</div>
      <h2 className="ob-title">ENTER YOUR CODE</h2>
      <p className="ob-body">We sent a 6-digit code to <b>{email.trim()}</b>.</p>
      <input className="ob-input ob-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={code} autoFocus onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); if (error) setError(null); }} onKeyDown={(e) => e.key === "Enter" && verify()} />
      {error && <p className="ct-error">{error}</p>}
      <button className="ob-btn" onClick={verify} disabled={busy}>{busy ? "ENLISTING…" : "ENLIST & POST MY SCORE →"}</button>
      <ResendCode email={email} />
      <button className="ob-skip" onClick={() => { setStep("email"); setCode(""); setError(null); }} disabled={busy}>‹ use a different email</button>
    </>
  );
}
