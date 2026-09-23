"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { resolveTestEmail } from "@/lib/test-email";
import { SUPER_ADMIN_EMAIL } from "@/lib/admin-shared";
import "./coming-soon.css";

type Step = "teaser" | "email" | "code";

export default function ComingSoonPage() {
  const [step, setStep] = useState<Step>("teaser");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Waitlist capture (the real purpose of this page pre-launch)
  const [side, setSide] = useState<"red" | "blue" | null>(null);
  const [wemail, setWemail] = useState("");
  const [wbusy, setWbusy] = useState(false);
  const [wdone, setWdone] = useState(false);
  const [werr, setWerr] = useState<string | null>(null);
  const [source, setSource] = useState("coming_soon");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get("side");
    if (s === "red" || s === "blue") setSide(s);
    const ref = q.get("ref") || q.get("r");
    if (ref) setSource(ref);
  }, []);

  async function joinWaitlist() {
    const mail = wemail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setWerr("Enter your email.");
      return;
    }
    setWbusy(true);
    setWerr(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: mail, side, source }),
      });
      if (!res.ok) {
        setWerr((await res.json()).error ?? "Try again.");
        setWbusy(false);
        return;
      }
      setWdone(true);
    } catch {
      setWerr("Couldn't reach the front. Try again.");
    } finally {
      setWbusy(false);
    }
  }

  async function sendCode() {
    const mail = resolveTestEmail(email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      setError("Enter your email.");
      return;
    }
    // Pre-launch: only the admin is cleared to enter.
    if (mail.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) {
      setError("This email isn't cleared for early access yet.");
      return;
    }
    setEmail(mail);
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await createClient().auth.signInWithOtp({
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
      const mail = email.trim();
      let err = (await supabase.auth.verifyOtp({ email: mail, token, type: "email" })).error;
      if (err) {
        err = (await supabase.auth.verifyOtp({ email: mail, token, type: "signup" })).error;
      }
      if (err) {
        setError(err.message || "That code didn't work. Check it and retry.");
        setBusy(false);
        return;
      }
      // Signed in as admin — full navigation so middleware re-evaluates.
      window.location.href = "/";
    } catch {
      setError("Couldn't verify. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="cs-wrap">
      <div className="cs-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="cs-logo" src="/logo.png" alt="Battleground" />
        <div className="cs-badge">◆ CLASSIFIED ◆</div>
        <h1 className="cs-title">COMING SOON</h1>
        <p className="cs-tag">
          A live, real-time territory war is being staged. Red vs Blue. One tile
          at a time. Mobilization is imminent.
        </p>

        {step === "teaser" &&
          (wdone ? (
            <div className="cs-gate">
              <p className="cs-tag cs-thanks">
                ✓ You&apos;re on the list{side ? `, ${side === "red" ? "🔴 Red" : "🔵 Blue"} soldier` : ""}. We&apos;ll
                signal you the moment mobilization begins.
              </p>
            </div>
          ) : (
            <div className="cs-gate">
              <p className="cs-pick">PICK YOUR SIDE</p>
              <div className="cs-sides">
                <button
                  className={"cs-side red" + (side === "red" ? " on" : "")}
                  onClick={() => setSide("red")}
                >
                  🔴 RED
                </button>
                <button
                  className={"cs-side blue" + (side === "blue" ? " on" : "")}
                  onClick={() => setSide("blue")}
                >
                  🔵 BLUE
                </button>
              </div>
              <input
                className="ob-input"
                type="email"
                placeholder="you@email.com"
                value={wemail}
                onChange={(e) => {
                  setWemail(e.target.value);
                  if (werr) setWerr(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") joinWaitlist();
                }}
              />
              {werr && <p className="ct-error">{werr}</p>}
              <button className="ob-btn" onClick={joinWaitlist} disabled={wbusy}>
                {wbusy ? "ENLISTING…" : "GET IN EARLY →"}
              </button>
              <button className="cs-clear" onClick={() => setStep("email")}>
                Have clearance? Sign in ›
              </button>
            </div>
          ))}

        {step === "email" && (
          <div className="cs-gate">
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
            <button className="ob-skip" onClick={() => setStep("teaser")} disabled={busy}>
              ‹ back
            </button>
          </div>
        )}

        {step === "code" && (
          <div className="cs-gate">
            <p className="cs-tag">
              Code sent to <b>{email.trim()}</b>. Enter it to enter command.
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
              {busy ? "VERIFYING…" : "ENTER →"}
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
          </div>
        )}
      </div>
    </main>
  );
}
