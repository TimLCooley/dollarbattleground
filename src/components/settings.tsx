"use client";

import { useEffect, useState } from "react";
import { RANKS, Insignia, rankFor, type Rank } from "@/lib/ranks";
import { ViewNav } from "./board";

interface StoredPlayer {
  side?: "red" | "blue";
  logins?: number;
  buys?: number;
  isOfficer?: boolean;
  placedFirst?: boolean;
}

function RankRow({ rank, current }: { rank: Rank; current?: string }) {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  const req =
    rank.tier === "recruit"
      ? "enlist"
      : rank.tier === "officer"
        ? plural(rank.req, "buy")
        : plural(rank.req, "login");
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

  const current = player
    ? rankFor({
        placedFirst: player.placedFirst ?? true,
        logins: player.logins ?? 1,
        isOfficer: player.isOfficer ?? false,
        buys: player.buys ?? 0,
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
                  {player.side?.toUpperCase()} team · {player.logins ?? 1} logins
                  · {player.buys ?? 0} buys
                </div>
              </div>
            </div>
          ) : (
            <p className="fm-note">Not enlisted yet — head to Home to join up.</p>
          )}
        </section>

        <section className="fm-section">
          <h2 className="fm-h">ENLISTED · climb by logins</h2>
          <ul className="fm-list">
            {enlisted.map((r) => (
              <RankRow key={r.key} rank={r} current={current?.key} />
            ))}
          </ul>
        </section>

        <section className="fm-section">
          <h2 className="fm-h">OFFICERS · climb by $ spent</h2>
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
