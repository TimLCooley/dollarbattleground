"use client";

import { useEffect, useState } from "react";
import { Insignia, rankFor, nextRank, progressOf } from "@/lib/ranks";
import { ViewNav } from "./board";
import { createClient } from "@/utils/supabase/client";

interface StoredPlayer {
  side?: "red" | "blue";
  logins?: number;
  spent?: number;
  isOfficer?: boolean;
  placedFirst?: boolean;
  captures?: number;
  reclaimed?: number;
  xStrikes?: number;
  officerActions?: number;
  days?: number;
  enlistedAt?: string;
  lastActionAt?: string | null;
  lastPromotionAt?: string | null;
  rankKey?: string;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function durationSince(iso?: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3.6e6);
  if (h < 1) return `${Math.max(1, Math.floor(ms / 6e4))}m`;
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="dr-row">
      <span className="dr-label">{label}</span>
      <span className="dr-dots" aria-hidden="true" />
      <span className="dr-value">{value}</span>
    </div>
  );
}

export function Settings() {
  const [player, setPlayer] = useState<StoredPlayer | null>(null);
  const [held, setHeld] = useState<number | null>(null);
  const [longest, setLongest] = useState<string | null>(null);

  useEffect(() => {
    let p: StoredPlayer | null = null;
    try {
      const raw = localStorage.getItem("bg_player_v1");
      if (raw) p = JSON.parse(raw) as StoredPlayer;
    } catch {
      /* ignore */
    }
    setPlayer(p);
    if (!p?.side) return;

    // Live positions currently held (owned by me and still my color).
    const supabase = createClient();
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { count } = await supabase
          .from("tiles")
          .select("*", { count: "exact", head: true })
          .eq("owner_id", user.id)
          .eq("team", p!.side!);
        setHeld(count ?? 0);
        const { data } = await supabase
          .from("tiles")
          .select("updated_at")
          .eq("owner_id", user.id)
          .eq("team", p!.side!)
          .order("updated_at", { ascending: true })
          .limit(1);
        if (data && data[0]) setLongest(data[0].updated_at as string);
      } catch {
        /* offline / not signed in */
      }
    })();
  }, []);

  if (!player?.side) {
    return (
      <>
        <div className="cartridge fieldreport">
          <header className="bg-header">
            <div className="wordmark">
              <span className="coin">$</span>field&nbsp;report
            </div>
          </header>
          <p className="fm-note">
            No service record on file. Report to Home to enlist.
          </p>
        </div>
        <ViewNav active="/settings" />
      </>
    );
  }

  const forRank = {
    placedFirst: player.placedFirst ?? true,
    logins: player.logins ?? 1,
    spent: player.spent ?? 0,
    isOfficer: player.isOfficer ?? false,
  };
  const rank = rankFor(forRank);
  const actions = progressOf(forRank);
  const next = nextRank(forRank);
  const side = player.side.toUpperCase();

  return (
    <>
      <div className="cartridge fieldreport">
        <header className="bg-header">
          <div className="wordmark">
            <span className="coin">$</span>field&nbsp;report
          </div>
          <div className="roundline">
            <span className="fr-classified">◆ CONFIDENTIAL ◆</span>
          </div>
        </header>

        <div className={"dr-subject rl-" + player.side}>
          {rank.insignia.kind !== "none" && (
            <Insignia ins={rank.insignia} size={44} />
          )}
          <div className="dr-subject-txt">
            <div className="dr-rank">{rank.name.toUpperCase()}</div>
            <div className="dr-side">
              <b>{side}</b> COMMAND
            </div>
          </div>
        </div>

        <section className="dr-section">
          <h2 className="fm-h">SERVICE RECORD</h2>
          <Row label="Date enlisted" value={fmtDate(player.enlistedAt)} />
          <Row label="Days reported for duty" value={player.days ?? 1} />
          <Row label="Current rank" value={rank.name} />
          <Row label="Side" value={side} />
        </section>

        <section className="dr-section">
          <h2 className="fm-h">COMBAT RECORD</h2>
          <Row label="Captures" value={player.captures ?? 0} />
          <Row
            label="Positions currently held"
            value={held == null ? "…" : held}
          />
          <Row label="Positions reclaimed" value={player.reclaimed ?? 0} />
          <Row
            label="Longest held position"
            value={longest ? durationSince(longest) : "—"}
          />
          <Row label="X-Strikes ordered" value={player.xStrikes ?? 0} />
          <Row label="Officer commands used" value={player.officerActions ?? 0} />
        </section>

        <section className="dr-section">
          <h2 className="fm-h">ADVANCEMENT</h2>
          <Row label="Promotions earned" value={rank.order} />
          <Row label="Last promotion" value={fmtDate(player.lastPromotionAt)} />
          <Row label="Last attack" value={fmtDate(player.lastActionAt)} />
          <Row label="Actions logged" value={actions} />
          {next ? (
            <div className="dr-promote">
              <div className="dr-promote-top">
                <span>
                  Promotion: <b>{next.rank.name.toUpperCase()}</b> in{" "}
                  {next.needed} more actions
                </span>
              </div>
              <div className="dr-bar">
                <i
                  style={{
                    width: `${Math.min(100, (actions / next.rank.req) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <Row label="Next promotion" value="Top of the ladder" />
          )}
        </section>
      </div>

      <ViewNav active="/settings" />
    </>
  );
}
