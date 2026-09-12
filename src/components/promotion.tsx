"use client";

import type { Team } from "./board";

// Enlisted rank chevron (the "/\" stripe). A real Private E-1 is blank, but a
// chevron reads unmistakably as "you got promoted".
function Chevron() {
  return (
    <svg viewBox="0 0 120 74" width="128" height="79" aria-hidden="true">
      <path
        d="M12 60 L60 12 L108 60 L86 60 L60 34 L34 60 Z"
        fill="var(--gold)"
        stroke="#7a5a12"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PromotionModal({
  rank,
  side,
  onClose,
}: {
  rank: string;
  side: Team;
  onClose: () => void;
}) {
  return (
    <div
      className="promo-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Promotion"
    >
      <div className={"promo-card " + side}>
        <div className="promo-kicker">◆ FIELD PROMOTION ◆</div>
        <div className="promo-insignia">
          <Chevron />
        </div>
        <h2 className="promo-rank">{rank}</h2>
        <p className="promo-body">
          You planted your flag and earned your stripe. Welcome to the ranks,{" "}
          {rank.charAt(0) + rank.slice(1).toLowerCase()} — now hold the line.
        </p>
        <button className="ob-btn" onClick={onClose} autoFocus>
          HOORAH →
        </button>
      </div>
    </div>
  );
}
