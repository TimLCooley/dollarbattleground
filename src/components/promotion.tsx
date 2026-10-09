"use client";

import type { Team } from "./board";
import { Insignia, type Rank } from "@/lib/ranks";

export function PromotionModal({
  rank,
  side,
  onClose,
  foundingNumber,
}: {
  rank: Rank;
  side: Team;
  onClose: () => void;
  foundingNumber?: number | null;
}) {
  const commissioned = rank.tier === "officer";
  const founding = commissioned && foundingNumber != null;
  return (
    <div
      className="promo-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Promotion"
      onClick={onClose}
    >
      <div className={"promo-card " + side}>
        <div className="promo-kicker">
          {founding ? `◆ FOUNDING OFFICER #${foundingNumber} ◆` : commissioned ? "◆ COMMISSIONED ◆" : "◆ FIELD PROMOTION ◆"}
        </div>
        <div className="promo-insignia">
          {rank.insignia.kind === "none" ? (
            <span className="promo-blank">no insignia</span>
          ) : (
            <Insignia ins={rank.insignia} size={92} />
          )}
        </div>
        <h2 className="promo-rank">{rank.name.toUpperCase()}</h2>
        <p className="promo-body">
          {founding
            ? `One of the first hundred. Commissioned on the spot — and a free 3×3 barrage, a 2×2 strike and an extra square are waiting on the board. Report for duty, ${rank.name}.`
            : commissioned
              ? `You bought your way to the top brass. Report for duty, ${rank.name}.`
              : `You've earned your stripe. Welcome to the ranks, ${rank.name} — now hold the line.`}
        </p>
        <button className="ob-btn" onClick={onClose} autoFocus>
          HOORAH →
        </button>
      </div>
    </div>
  );
}
