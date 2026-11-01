"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { owns, seasonNext, seasonNow, nextSale, type Skin } from "@/lib/commander/skins";
import { track } from "@/lib/track";
import { TroopIcon } from "./icons";
import { MiniBoard } from "./store";
import { FallingLeaves } from "./falling-leaves";

// This season's Regiment (Tim, 2026-10-31): showcased beside the game on
// desktop (left: the cast, right: a live preview + buy), a strip under the
// game on phones, and a once-a-season pop-up when you're logged in. Hidden
// once you own it. The admin sees it before the season opens, to check it.

const KINDS = ["commander", "archer", "soldier", "scout"] as const;
const dollars = (cents: number) => `$${(cents / 100).toFixed(0)}`;
const month = (s: Skin) => (s.sale?.[0] ? new Date(s.sale[0].from + "T12:00:00").toLocaleDateString("en-US", { month: "long" }) : "");
const seenKey = (id: string) => `bg_promo_${id}`;

export function SeasonPromo({ signedIn, isAdmin, onLogin }: { signedIn: boolean; isAdmin?: boolean; onLogin: () => void }) {
  const live = seasonNow();
  const skin = live ?? (isAdmin ? seasonNext() : null);
  const preview = !live; // admin only: not on sale yet
  const [owned, setOwned] = useState<string[] | null>(signedIn ? null : []);
  const [popup, setPopup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn || !skin) return;
    let off = false;
    fetch("/api/store", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { owned?: string[] }) => !off && setOwned(d.owned ?? []))
      .catch(() => !off && setOwned([]));
    return () => {
      off = true;
    };
  }, [signedIn, skin]);

  const have = !!skin && !!owned && owns(owned, skin.id);

  // the pop-up: logged in, don't own it, once per season (wait for other pop-ups to close)
  useEffect(() => {
    if (!skin || !signedIn || !owned || have) return;
    let seen = false;
    try {
      seen = !!localStorage.getItem(seenKey(skin.id)) && !location.search.includes("promo=1");
    } catch {
      /* storage blocked: show it */
    }
    if (seen) return;
    const t = setInterval(() => {
      if (document.querySelector(".ob-overlay")) return;
      clearInterval(t);
      setPopup(true);
      track("promo_view", { item: skin.id });
    }, 1500);
    return () => clearInterval(t);
  }, [skin, signedIn, owned, have]);

  if (!skin || !skin.cast || have) return null;

  function closePopup() {
    setPopup(false);
    try {
      localStorage.setItem(seenKey(skin!.id), "1");
    } catch {
      /* ignore */
    }
  }

  async function buy(from: string) {
    track("promo_click", { item: skin!.id, from });
    if (!signedIn) {
      closePopup();
      return onLogin();
    }
    setBusy(true);
    setError(null);
    track("store_checkout", { item: skin!.id });
    const r = await fetch("/api/store/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item: skin!.id }) });
    const d = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
    if (d.url) window.location.assign(d.url);
    else {
      setBusy(false);
      setError(d.error ?? "Couldn't open checkout — try again.");
    }
  }

  const opens = nextSale(skin);
  const cta = preview ? `On sale ${opens ? new Date(opens + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "soon"}` : `Enlist them · ${dollars(skin.price)}`;
  const art = skin.art;
  const snow = art === "holiday";

  const cast = (
    <ul className="sp-cast">
      {KINDS.map((k) => (
        <li key={k}>
          <span className="sp-cast-ic" style={{ color: skin.me }}>
            <TroopIcon kind={k} art={art} />
          </span>
          {skin.cast![k]}
        </li>
      ))}
    </ul>
  );
  const board = (
    <div className="sp-board">
      <FallingLeaves count={snow ? 18 : 7} snow={snow} />
      <MiniBoard me={skin.me} them={skin.them} art={art} />
    </div>
  );
  const buyBtn = (from: string) => (
    <button className="sp-buy" disabled={busy || preview} onClick={() => void buy(from)}>
      {busy ? "Opening…" : cta}
    </button>
  );

  return (
    <>
      <aside className={"sp-rail left sp-" + art} aria-label={skin.name}>
        <p className="sp-kicker">{month(skin)} only</p>
        <h2 className="sp-title">{skin.name}</h2>
        {cast}
        <p className="sp-note">Your whole army changes for the season — troops, trees, walls and weather.</p>
      </aside>
      <aside className={"sp-rail right sp-" + art} aria-label={`${skin.name} preview`}>
        {board}
        {buyBtn("rail")}
        <p className="sp-note">Any purchase commissions you as an officer.{preview ? " (Admin preview.)" : ""}</p>
        <Link href="/store" className="sp-more">See the store ›</Link>
      </aside>

      {/* phones: a slim strip under the game */}
      <div className={"sp-strip sp-" + art}>
        <span className="sp-strip-ic" style={{ color: skin.me }}>
          <TroopIcon kind="commander" art={art} />
        </span>
        <span className="sp-strip-txt">
          <b>{skin.name}</b>
          <small>{month(skin)} only · {dollars(skin.price)}</small>
        </span>
        <button className="sp-strip-btn" onClick={() => setPopup(true)}>See it</button>
      </div>

      {popup && (
        <div className="ob-overlay sp-overlay" role="dialog" aria-label={skin.name} onClick={closePopup}>
          <div className={"ob-card sp-card sp-" + art} onClick={(e) => e.stopPropagation()}>
            <button className="sp-x" aria-label="Close" onClick={closePopup}>×</button>
            <p className="sp-kicker">New for {month(skin)}</p>
            <h2 className="sp-title">The {skin.name} has arrived</h2>
            {board}
            {cast}
            {buyBtn("popup")}
            {error && <p className="sp-err">{error}</p>}
            <p className="sp-note">{month(skin)} only — then it&apos;s gone until next year. Comes with an officer&apos;s commission.</p>
            <button className="sp-later" onClick={closePopup}>Maybe later</button>
          </div>
        </div>
      )}
    </>
  );
}
