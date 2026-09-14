"use client";

import { useState } from "react";
import type { Team } from "./board";
import { LoginOtp } from "./login-otp";

type View = "pick" | "login";

export function Onboarding({
  onEnlist,
}: {
  onEnlist: (side: Team) => void;
}) {
  const [view, setView] = useState<View>("pick");

  return (
    <div className="ob-overlay" role="dialog" aria-modal="true" aria-label="Enlist">
      <div className="ob-card">
        {view === "pick" && (
          <>
            <div className="ob-kicker">◆ RECRUITMENT OPEN ◆</div>
            <h1 className="ob-title">THE BATTLEGROUND</h1>
            <p className="ob-body">
              One board. Two colors. Total war. The fight is already underway.
            </p>
            <p className="ob-prompt">Pick your side.</p>
            <div className="ob-sides">
              <button className="ob-side blue" onClick={() => onEnlist("blue")}>
                <span className="ob-swatch" />
                BLUE
              </button>
              <button className="ob-side red" onClick={() => onEnlist("red")}>
                <span className="ob-swatch" />
                RED
              </button>
            </div>
            <p className="ob-fine">
              Choose carefully. There is no switching sides.
            </p>
            <div className="ob-divider" aria-hidden="true" />
            <button
              type="button"
              className="ob-login-link"
              onClick={() => setView("login")}
            >
              Already enlisted? Log in / Re-join the War
            </button>
          </>
        )}

        {view === "login" && (
          <LoginOtp
            onBack={() => setView("pick")}
            onSignedIn={() => window.location.reload()}
          />
        )}
      </div>
    </div>
  );
}
