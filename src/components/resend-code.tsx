"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";

// "Didn't get it?" — resend the 6-digit code, with a short cooldown so a
// frustrated tap-tap-tap doesn't hit the email rate limit.
export function ResendCode({ email }: { email: string }) {
  const [wait, setWait] = useState(30);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wait]);
  async function resend() {
    setBusy(true);
    setMsg(null);
    const { error } = await createClient().auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: true } });
    setBusy(false);
    if (error) setMsg(error.message || "Couldn't resend. Try again in a minute.");
    else {
      setMsg("New code sent — the newest one is the one that works.");
      setWait(45);
    }
  }
  return (
    <div className="resend-code">
      <p className="ob-body resend-hint">Not there? Check spam or promotions.</p>
      <button className="ob-skip" type="button" onClick={resend} disabled={busy || wait > 0}>
        {busy ? "SENDING…" : wait > 0 ? `resend code in ${wait}s` : "↻ resend my code"}
      </button>
      {msg && <p className="resend-msg">{msg}</p>}
    </div>
  );
}
