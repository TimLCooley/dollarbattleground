"use client";

import { useEffect, useState } from "react";
import { RANKS, Insignia, rankFor, type Rank } from "@/lib/ranks";
import { ViewNav } from "./board";

interface StoredPlayer {
  side?: "red" | "blue";
  logins?: number;
  spent?: number;
  isOfficer?: boolean;
  placedFirst?: boolean;
}

function RankRow({ rank, current }: { rank: Rank; current?: string }) {
  const req = rank.tier === "recruit" ? "enlist" : `${rank.req} pts`;
  return (
    <li className={current === rank.key ? "is-current" : ""}>
      <span className="fm-ins">
        {rank.insignia.kind === "none" ? (
          <span className="fm-blank">—</span>
        ) : (
          <Insignia ins={rank.insignia} size={34} />
        )}
      </span>
      <span className="fm-name">{rank.name}</span>
      <span className="fm-req">{req}</span>
    </li>
  );
}

export function Settings() {
  const [player, setPlayer] = useState<StoredPlayer | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("bg_player_v1");
      if (raw) setPlayer(JSON.parse(raw) as StoredPlayer);
    } catch {
      /* ignore */
    }
  }, []);

  const spent = player?.spent ?? 0;
  const logins = player?.logins ?? 1;
  const points = spent + logins;
  const current = player
    ? rankFor({
        placedFirst: player.placedFirst ?? true,
        logins,
        isOfficer: player.isOfficer ?? false,
        spent,
      })
    : null;

  const enlisted = RANKS.filter((r) => r.tier !== "officer");
  const officers = RANKS.filter((r) => r.tier === "officer");

  return (
    <>
      <div className="cartridge settings">
        <header className="bg-header">
          <div className="wordmark">
            <span className="coin">$</span>field&nbsp;manual
          </div>
          <div className="roundline">
            <span>Ranks &amp; Orders</span>
          </div>
        </header>

        <section className="fm-section">
          <h2 className="fm-h">YOUR RECORD</h2>
          {current && player ? (
            <div className="fm-record">
              {current.insignia.kind !== "none" && (
                <Insignia ins={current.insignia} size={42} />
              )}
              <div>
                <div className="fm-rank">{current.name}</div>
                <div className="fm-sub">
                  {player.side?.toUpperCase()} team · ${spent} spent · {logins}{" "}
                  login{logins === 1 ? "" : "s"} · <b>{points} pts</b>
                </div>
              </div>
            </div>
          ) : (
            <p className="fm-note">Not enlisted yet — head to Home to join up.</p>
          )}
        </section>

        <p className="fm-note fm-legend">
          Career points = $ spent + logins. Every action ranks you up.
        </p>

        <section className="fm-section">
          <h2 className="fm-h">ENLISTED · by career pts</h2>
          <ul className="fm-list">
            {enlisted.map((r) => (
              <RankRow key={r.key} rank={r} current={current?.key} />
            ))}
          </ul>
        </section>

        <section className="fm-section">
          <h2 className="fm-h">OFFICERS · by career pts · $5 to enter</h2>
          <ul className="fm-list">
            {officers.map((r) => (
              <RankRow key={r.key} rank={r} current={current?.key} />
            ))}
          </ul>
        </section>

        <section className="fm-section">
          <h2 className="fm-h">ORDERS</h2>
          <ul className="fm-orders">
            <li>
              <b>$1</b> Flip one tile to your color.
            </li>
            <li>
              <b>$5</b> X-flip 5 tiles + a bonus tile — earns your officer&apos;s
              commission.
            </li>
            <li>
              <b>$10</b> Airstrike: seize a 3×3 block. Officers only.
            </li>
          </ul>
        </section>
      </div>

      <ViewNav active="/settings" />
    </>
  );
}
