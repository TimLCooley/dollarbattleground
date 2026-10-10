"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { track } from "@/lib/track";

// "What's confusing? 10 seconds." — the ask the Developer's clips point at.
export function FeedbackButton({ side }: { side?: string | null }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function send() {
    if (msg.trim().length < 2) return;
    setState("sending");
    const { error } = await createClient().rpc("send_feedback", {
      p_message: msg.trim(),
      p_email: email.trim() || null,
      p_side: side ?? null,
      p_page: window.location.pathname,
    });
    setState(error ? "error" : "sent");
    if (!error) setMsg("");
  }

  return (
    <>
      <button
        type="button"
        className="fb-tab"
        onClick={() => {
          setOpen(true);
          setState("idle");
          track("feedback_open");
        }}
      >
        Feedback
      </button>
      {open && (
        <div className="ob-overlay" role="dialog" aria-modal="true" aria-label="Feedback" onClick={() => setOpen(false)}>
          <div className="ob-card" onClick={(e) => e.stopPropagation()}>
            {state === "sent" ? (
              <>
                <h2 className="ob-title">THANK YOU</h2>
                <p className="ob-body">I read every one of these. — Tim</p>
                <button className="ob-btn" onClick={() => setOpen(false)}>BACK TO THE MAP →</button>
              </>
            ) : (
              <>
                <div className="ob-kicker">◆ 10 SECONDS ◆</div>
                <h2 className="ob-title">WHAT&apos;S CONFUSING?</h2>
                <p className="ob-body">I&apos;m building this in public. Anything broken, unclear, boring, or fun — tell me.</p>
                <textarea className="ob-input fb-text" rows={4} autoFocus value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Type anything…" />
                <input className="ob-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional, if you want a reply)" />
                {state === "error" && <p className="ct-error">Couldn&apos;t send — try again.</p>}
                <button className="ob-btn" onClick={send} disabled={state === "sending" || msg.trim().length < 2}>
                  {state === "sending" ? "SENDING…" : "SEND →"}
                </button>
                <button className="ob-skip" onClick={() => setOpen(false)}>‹ never mind</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
