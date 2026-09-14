"use client";

import { useState } from "react";
import type { Team } from "./board";
import { resolveTestEmail } from "@/lib/test-email";

export function ClaimTile({
  side,
  onConfirm,
  onReselect,
}: {
  side: Team;
  onConfirm: (email: string, optIn: boolean) => void;
  onReselect: () => void;
}) {
  const [email, setEmail] = useState("");
  const [optIn, setOptIn] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  async function submit() {
    const mail = resolveTestEmail(email); // dev "aaa" alias → owner inbox
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setError("That doesn't look like a valid email address.");
      return;
    }
    setChecking(true);
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
        setChecking(false);
        return;
      }
      onConfirm(mail, optIn);
    } catch {
      // Validation service unreachable — don't block the funnel on our outage.
      onConfirm(mail, optIn);
    } finally {
      setChecking(false);
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
        <div className="ob-kicker">◆ CLAIM YOUR POSITION ◆</div>
        <h2 className="ob-title">LOCK IT IN</h2>
        <p className="ob-body">
          This position is yours to take — free. Enter your email and we&apos;ll
          send your field orders and lock in your tile.
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
            if (e.key === "Enter") submit();
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
            Send me Field Dispatches — battle updates, faction news, and calls to
            action. Unsubscribe anytime.
          </span>
        </label>
        <button className="ob-btn" onClick={submit} disabled={checking}>
          {checking ? "CHECKING…" : "CLAIM POSITION →"}
        </button>
        <button className="ob-skip" onClick={onReselect} disabled={checking}>
          ‹ pick a different square
        </button>
      </div>
    </div>
  );
}
