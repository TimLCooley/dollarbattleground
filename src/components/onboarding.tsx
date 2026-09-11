"use client";

import { useState } from "react";
import type { Team } from "./board";

type Step = "welcome" | "side" | "promote" | "claim";

export function Onboarding({
  onComplete,
}: {
  onComplete: (side: Team, name: string, email: string) => void;
}) {
  const [step, setStep] = useState<Step>("welcome");
  const [side, setSide] = useState<Team | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const enemy = side === "red" ? "Blue" : "Red";
  const accent = side ? ` ${side}` : "";

  return (
    <div className="ob-overlay" role="dialog" aria-modal="true" aria-label="Enlist">
      <div className={"ob-card" + accent}>
        {step === "welcome" && (
          <>
            <div className="ob-kicker">◆ INCOMING ◆</div>
            <h1 className="ob-title">THE BATTLEGROUND</h1>
            <p className="ob-body">
              One board. Two colors. Total war. The fight is already raging —
              without you. Time to change that.
            </p>
            <button className="ob-btn" onClick={() => setStep("side")}>
              ENTER THE WAR →
            </button>
          </>
        )}

        {step === "side" && (
          <>
            <h2 className="ob-title">CHOOSE YOUR SIDE</h2>
            <p className="ob-body">
              Pick a color. You fight for it now — there is no switching sides
              mid-war.
            </p>
            <div className="ob-sides">
              <button
                className="ob-side blue"
                onClick={() => {
                  setSide("blue");
                  setStep("promote");
                }}
              >
                <span className="ob-swatch" />
                BLUE
              </button>
              <button
                className="ob-side red"
                onClick={() => {
                  setSide("red");
                  setStep("promote");
                }}
              >
                <span className="ob-swatch" />
                RED
              </button>
            </div>
          </>
        )}

        {step === "promote" && (
          <>
            <div className="ob-kicker">◆ FIELD PROMOTION ◆</div>
            <h2 className="ob-title">You&apos;re a CAPTAIN now.</h2>
            <p className="ob-body">
              Every Captain needs a name the {enemy}s will learn to fear. What do
              we call you?
            </p>
            <input
              className="ob-input"
              type="text"
              placeholder="Your callsign"
              value={name}
              maxLength={20}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) setStep("claim");
              }}
            />
            <button
              className="ob-btn"
              disabled={!name.trim()}
              onClick={() => setStep("claim")}
            >
              ACCEPT COMMISSION →
            </button>
          </>
        )}

        {step === "claim" && side && (
          <>
            <h2 className="ob-title">CLAIM YOUR FIRST TILE</h2>
            <p className="ob-body">
              Your first unit deploys <b>free</b>, Captain {name || ""}. Where
              should we send your field orders?
            </p>
            <input
              className="ob-input"
              type="email"
              placeholder="you@email.com"
              value={email}
              autoFocus
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onComplete(side, name.trim(), email.trim());
              }}
            />
            <button
              className="ob-btn"
              onClick={() => onComplete(side, name.trim(), email.trim())}
            >
              DEPLOY MY UNIT →
            </button>
            <button
              className="ob-skip"
              onClick={() => onComplete(side, name.trim(), "")}
            >
              skip — deploy without orders
            </button>
          </>
        )}
      </div>
    </div>
  );
}
