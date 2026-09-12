"use client";

import { useState } from "react";
import type { Team } from "./board";

type Step = "recruit" | "enlist";

export function Onboarding({
  onComplete,
}: {
  onComplete: (side: Team, email: string) => void;
}) {
  const [step, setStep] = useState<Step>("recruit");
  const [side, setSide] = useState<Team | null>(null);
  const [email, setEmail] = useState("");

  function choose(t: Team) {
    setSide(t);
    setStep("enlist");
  }

  const accent = side ? ` ${side}` : "";

  return (
    <div className="ob-overlay" role="dialog" aria-modal="true" aria-label="Enlist">
      <div className={"ob-card" + accent}>
        {step === "recruit" && (
          <>
            <div className="ob-kicker">◆ RECRUITMENT OPEN ◆</div>
            <h1 className="ob-title">THE BATTLEGROUND</h1>
            <p className="ob-body">
              One board. Two colors. Total war. The fight is already underway.
            </p>
            <p className="ob-prompt">Pick your side.</p>
            <div className="ob-sides">
              <button className="ob-side blue" onClick={() => choose("blue")}>
                <span className="ob-swatch" />
                BLUE
              </button>
              <button className="ob-side red" onClick={() => choose("red")}>
                <span className="ob-swatch" />
                RED
              </button>
            </div>
            <p className="ob-fine">
              Choose carefully. There is no switching sides.
            </p>
          </>
        )}

        {step === "enlist" && side && (
          <>
            <div className="ob-kicker">◆ ENLISTMENT COMPLETE ◆</div>
            <h2 className="ob-title">WELCOME, RECRUIT.</h2>
            <p className="ob-body">
              You fight for <b>{side.toUpperCase()}</b> now. Your first
              deployment is free.
            </p>
            <p className="ob-prompt">Where should we send your field orders?</p>
            <input
              className="ob-input"
              type="email"
              placeholder="you@email.com"
              value={email}
              autoFocus
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onComplete(side, email.trim());
              }}
            />
            <button
              className="ob-btn"
              onClick={() => onComplete(side, email.trim())}
            >
              DEPLOY ME →
            </button>
            <button className="ob-skip" onClick={() => onComplete(side, "")}>
              skip — deploy without orders
            </button>
          </>
        )}
      </div>
    </div>
  );
}
