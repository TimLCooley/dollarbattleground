"use client";

import { useState } from "react";
import type { Team } from "./board";
import { resolveTestEmail } from "@/lib/test-email";
import { createClient } from "@/utils/supabase/client";

import { CampaignCountdown } from "./campaign-countdown";

type Step = "email" | "code";

export function ClaimTile({
  side,
  onConfirm,
  onReselect,
}: {
  side: Team;
  // Called only after the email is verified with a code — so the tile flips for
  // a real, owned inbox and the player is signed in going forward.
  onConfirm: (email: string, optIn: boolean) => void;
  onReselect: () => void;
}) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [optIn, setOptIn] = useState(true);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  // Step 1: validate the email, then send a 6-digit code to prove ownership.
  async function sendCode() {
    const mail = resolveTestEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setError("That doesn't look like a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    setSuggestion(null);
    try {
      const res = await fetch("/api/email/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: mail }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        reason?: string;
        suggestion?: string;
      };
      if (!data.ok) {
        setError(data.reason ?? "Enter a valid email address.");
        if (data.suggestion) setSuggestion(data.suggestion);
        setBusy(false);
        return;
      }
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
      setEmail(mail);
      setStep("code");
    } catch {
      setError("Couldn't reach command. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // Step 2: verify the code, then claim.
  async function verifyAndClaim() {
    const token = code.trim();
    if (!/^\d{6}$/.test(token)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const mail = email.trim();
      let err = (await supabase.auth.verifyOtp({ email: mail, token, type: "email" }))
        .error;
      if (err) {
        err = (await supabase.auth.verifyOtp({ email: mail, token, type: "signup" }))
          .error;
      }
      if (err) {
        setError(err.message || "That code didn't work. Check it and retry.");
        setBusy(false);
        return;
      }
      // Record the dispatch opt-in server-side (the email sweep reads it).
      fetch("/api/email/prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ takeover_alerts: optIn, reminders: optIn }),
      }).catch(() => {});
      onConfirm(mail, optIn);
    } catch {
      setError("Couldn't verify. Try again.");
      setBusy(false);
    }
  }

  function acceptSuggestion() {
    if (!suggestion) return;
    setEmail(suggestion);
    setSuggestion(null);
    setError(null);
  }

  return (
    <div
      className="ob-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Claim your position"
      onClick={onReselect}
    >
      <div className={"ob-card " + side} onClick={(e) => e.stopPropagation()}>
        {step === "email" ? (
          <>
            <div className="ob-kicker">◆ CLAIM YOUR POSITION ◆</div>
            <h2 className="ob-title">LOCK IT IN</h2>
            <CampaignCountdown side={side} />
            <p className="ob-body">
              This position is yours — free. Enter your email and we&apos;ll send
              a quick 6-digit code to confirm it&apos;s really you.
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
            {error && (
              <p className="ct-error">
                {error}
                {suggestion && (
                  <button type="button" className="ct-fix" onClick={acceptSuggestion}>
                    Use {suggestion}
                  </button>
                )}
              </p>
            )}
            <label className="ob-consent">
              <input
                type="checkbox"
                className="ob-check"
                checked={optIn}
                onChange={(e) => setOptIn(e.target.checked)}
              />
              <span className="ob-consent-txt">
                Send me Field Dispatches — battle updates, faction news, and calls
                to action. Unsubscribe anytime.
              </span>
            </label>
            <button className="ob-btn" onClick={sendCode} disabled={busy}>
              {busy ? "SENDING…" : "SEND MY CODE →"}
            </button>
            <button className="ob-skip" onClick={onReselect} disabled={busy}>
              ‹ pick a different square
            </button>
          </>
        ) : (
          <>
            <div className="ob-kicker">◆ CONFIRM IT&apos;S YOU ◆</div>
            <h2 className="ob-title">ENTER YOUR CODE</h2>
            <CampaignCountdown side={side} />
            <p className="ob-body">
              We sent a 6-digit code to <b>{email.trim()}</b>. Enter it to lock in
              your tile.
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
                if (e.key === "Enter") verifyAndClaim();
              }}
            />
            {error && <p className="ct-error">{error}</p>}
            <button className="ob-btn" onClick={verifyAndClaim} disabled={busy}>
              {busy ? "VERIFYING…" : "CLAIM POSITION →"}
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
        )}
      </div>
    </div>
  );
}
