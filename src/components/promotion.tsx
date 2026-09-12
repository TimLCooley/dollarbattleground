"use client";

import type { Team } from "./board";
import { Insignia, type Rank } from "@/lib/ranks";

export function PromotionModal({
  rank,
  side,
  onClose,
}: {
  rank: Rank;
  side: Team;
  onClose: () => void;
}) {
  const commissioned = rank.tier === "officer";
  return (
    <div
      className="promo-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Promotion"
    >
      <div className={"promo-card " + side}>
        <div className="promo-kicker">
          {commissioned ? "◆ COMMISSIONED ◆" : "◆ FIELD PROMOTION ◆"}
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
          {commissioned
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
