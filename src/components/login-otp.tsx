"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { resolveTestEmail } from "@/lib/test-email";

type Step = "email" | "code";

// Inline OTP login — the alternative to a magic link. The player enters their
// email, gets a 6-digit code, and types it right here without ever leaving the
// game. Verifying the code proves they own the inbox and signs them in
// (Supabase creates the account on first login; the DB trigger flags
// timlcooley@gmail.com as super-admin automatically).
export function LoginOtp({
  onBack,
  onSignedIn,
}: {
  onBack: () => void;
  onSignedIn: () => void;
}) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    const mail = resolveTestEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setError("Enter the email you enlisted with.");
      return;
    }
    setEmail(mail); // normalize (incl. dev "aaa" alias) so verify uses it too
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithOtp({
        email: mail,
        options: { shouldCreateUser: true },
      });
      if (err) {
        setError(err.message || "Couldn't send your code. Try again.");
        setBusy(false);
        return;
      }
      setStep("code");
    } catch {
      setError("Couldn't reach command. Try again.");
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
      const { error: err } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token,
        type: "email",
      });
      if (err) {
        setError(err.message || "That code didn't work. Check it and retry.");
        setBusy(false);
        return;
      }
      onSignedIn();
    } catch {
      setError("Couldn't verify. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "email") {
    return (
      <>
        <div className="ob-kicker">◆ WELCOME BACK ◆</div>
        <h2 className="ob-title">RE-JOIN THE WAR</h2>
        <p className="ob-body">
          Enter your email and we&apos;ll send a 6-digit code to get you back to
          your unit. No password, no leaving the game.
        </p>
        <input
          className="ob-input"
          type="email"
          placeholder="you@email.com"
          value={email}
          autoFocus
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendCode();
          }}
        />
        {error && <p className="ct-error">{error}</p>}
        <button className="ob-btn" onClick={sendCode} disabled={busy}>
          {busy ? "SENDING…" : "SEND MY CODE →"}
        </button>
        <button className="ob-skip" onClick={onBack} disabled={busy}>
          ‹ back to recruitment
        </button>
      </>
    );
  }

  return (
    <>
      <div className="ob-kicker">◆ ENTER YOUR CODE ◆</div>
      <h2 className="ob-title">CHECK YOUR EMAIL</h2>
      <p className="ob-body">
        We sent a 6-digit code to <b>{email.trim()}</b>. Enter it below to
        re-join.
      </p>
      <input
        className="ob-input ob-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="000000"
        value={code}
        autoFocus
        onChange={(e) => {
          setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
          if (error) setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") verify();
        }}
      />
      {error && <p className="ct-error">{error}</p>}
      <button className="ob-btn" onClick={verify} disabled={busy}>
        {busy ? "VERIFYING…" : "RE-JOIN →"}
      </button>
      <button
        className="ob-skip"
        onClick={() => {
          setStep("email");
          setCode("");
          setError(null);
        }}
        disabled={busy}
      >
        ‹ use a different email
      </button>
    </>
  );
}
