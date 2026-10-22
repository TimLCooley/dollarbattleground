"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CELLS, SIZE, TREE, WALL, WATER, simulate, solve, type Kind } from "@/lib/commander/engine";
import { DEMO_LAYOUT } from "@/lib/commander/demo-map";
import { ALL_ACCESS, SKINS, isHex, owns, priceOf, skinColors, type Skin } from "@/lib/commander/skins";
import { LoginOtp } from "@/components/login-otp";
import { CommanderLogo } from "./logo";
import { TroopIcon } from "./icons";
import { track } from "@/lib/track";

// The CommanderBG store (Tim, 2026-10-21): skins you can try on before buying,
// and use any time after. Buying goes through Stripe Checkout; the server
// grants it (webhook + the return here). Any purchase commissions you as an officer.

type State = { signedIn: boolean; owned: string[]; skin: string | null; custom: { me: string; them: string } | null; side: "red" | "blue" | null };
const dollars = (cents: number) => `$${(cents / 100).toFixed(0)}`;

export function CommanderStore({ paid }: { paid?: string }) {
  const [st, setSt] = useState<State | null>(null);
  const [preview, setPreview] = useState<string>("classic");
  const [custom, setCustom] = useState({ me: "#356fd0", them: "#d23b3b" });
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [login, setLogin] = useState(false);

  async function load() {
    const d = (await fetch("/api/store", { cache: "no-store" }).then((r) => r.json())) as State;
    setSt(d);
    if (d.skin) setPreview(d.skin);
    if (d.custom) setCustom(d.custom);
    return d;
  }
  useEffect(() => {
    track("store_open");
    void (async () => {
      await load();
      if (!paid) return;
      // back from Stripe: grant it now and switch to it
      setNote("Confirming your purchase…");
      const r = await fetch("/api/store/finalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session: paid }) });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; item?: string; error?: string };
      window.history.replaceState(null, "", "/store");
      if (!r.ok || !d.item) {
        setNote(null);
        setError(d.error ?? "Couldn't confirm the purchase yet — refresh in a minute.");
        return;
      }
      track("store_purchase", { item: d.item, value: (priceOf(d.item) ?? 0) / 100 });
      if (d.item !== ALL_ACCESS.id && d.item !== "custom") await use(d.item, false);
      await load();
      setNote(d.item === ALL_ACCESS.id ? "Every skin is yours — forever. You're an officer now." : "Unlocked and equipped. You're an officer now — check your rank.");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const side = st?.side ?? "blue";
  const owned = st?.owned ?? [];
  const allAccess = owned.includes(ALL_ACCESS.id);

  async function buy(item: string) {
    if (!st?.signedIn) return setLogin(true);
    setBusy(item);
    setError(null);
    track("store_checkout", { item });
    const r = await fetch("/api/store/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ item }) });
    const d = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
    if (d.url) window.location.href = d.url;
    else {
      setBusy(null);
      setError(d.error ?? "Couldn't open checkout — try again.");
    }
  }

  async function use(skin: string, reload = true) {
    setBusy(skin);
    setError(null);
    const r = await fetch("/api/store/skin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ skin, custom: skin === "custom" ? custom : undefined }) });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(null);
    if (!r.ok) return setError(d.error ?? "Couldn't switch skins — try again.");
    if (reload) {
      await load();
      setNote("Equipped — it's on your board now.");
    }
  }

  const colors = preview === "custom" ? (isHex(custom.me) && isHex(custom.them) ? custom : skinColors(null, null, side)) : skinColors(preview, null, side);

  return (
    <div className={"cm-wrap side-" + side}>
      <div className="cm-head">
        <Link href="/" className="cm-back">‹ today&apos;s map</Link>
        <h1 className="cm-title">
          <CommanderLogo side={side} />
        </h1>
        <div className="cm-day">STORE</div>
      </div>

      <div className="st-officer">
        <b>Any purchase makes you an officer.</b>{" "}You start at 2nd Lieutenant and climb to General — the earlier you&apos;re commissioned, the further you get.
      </div>

      {note && <div className="cm-banner">{note}</div>}
      {error && <p className="ct-error">{error}</p>}

      <MiniBoard me={colors.me} them={colors.them} />
      <p className="st-hint">Tap a skin to try it on.</p>

      <div className={"st-all" + (allAccess ? " owned" : "")}>
        <div>
          <div className="st-all-name">{ALL_ACCESS.name}</div>
          <div className="st-all-blurb">Every skin now — and every seasonal skin we ever release.</div>
        </div>
        {allAccess ? (
          <span className="st-owned">OWNED</span>
        ) : (
          <button className="ob-btn" disabled={busy === ALL_ACCESS.id} onClick={() => buy(ALL_ACCESS.id)}>
            {busy === ALL_ACCESS.id ? "OPENING…" : dollars(ALL_ACCESS.price)}
          </button>
        )}
      </div>

      <div className="st-grid">
        {SKINS.map((s) => (
          <SkinCard
            key={s.id}
            s={s}
            side={side}
            custom={custom}
            onCustom={setCustom}
            previewing={preview === s.id}
            using={(st?.skin ?? "classic") === s.id}
            mine={owns(owned, s.id)}
            busy={busy === s.id}
            onPreview={() => setPreview(s.id)}
            onBuy={() => buy(s.id)}
            onUse={() => use(s.id)}
          />
        ))}
      </div>

      <p className="st-fine">
        Skins change your board in CommanderBG and the pictures you share. Purchases are one-time and stay with your account on every device. Seasonal skins arrive each month and come back for a limited time later.
      </p>

      {login && (
        <div className="ob-overlay" role="dialog" aria-label="Log in" onClick={() => setLogin(false)}>
          <div className="ob-card" onClick={(e) => e.stopPropagation()}>
            <LoginOtp
              onBack={() => setLogin(false)}
              onSignedIn={() => {
                setLogin(false);
                void load();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SkinCard({
  s,
  side,
  custom,
  onCustom,
  previewing,
  using,
  mine,
  busy,
  onPreview,
  onBuy,
  onUse,
}: {
  s: Skin;
  side: "red" | "blue";
  custom: { me: string; them: string };
  onCustom: (c: { me: string; them: string }) => void;
  previewing: boolean;
  using: boolean;
  mine: boolean;
  busy: boolean;
  onPreview: () => void;
  onBuy: () => void;
  onUse: () => void;
}) {
  const c = s.id === "custom" ? custom : skinColors(s.id, null, side);
  return (
    <div className={"st-card" + (previewing ? " on" : "")} onClick={onPreview} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onPreview()}>
      <div className="st-swatch" aria-hidden>
        <i style={{ background: c.me }} />
        <i style={{ background: c.them }} />
      </div>
      <div className="st-name">{s.name}</div>
      <div className="st-blurb">{s.blurb}</div>
      {s.id === "custom" && (
        <div className="st-pick" onClick={(e) => e.stopPropagation()}>
          <label>
            You <input type="color" value={custom.me} onChange={(e) => (onCustom({ ...custom, me: e.target.value }), onPreview())} />
          </label>
          <label>
            Enemy <input type="color" value={custom.them} onChange={(e) => (onCustom({ ...custom, them: e.target.value }), onPreview())} />
          </label>
        </div>
      )}
      <div className="st-act" onClick={(e) => e.stopPropagation()}>
        {mine ? (
          using && s.id !== "custom" ? (
            <span className="st-owned">USING</span>
          ) : (
            <button className="cm-chip" disabled={busy} onClick={onUse}>
              {busy ? "…" : using ? "SAVE COLORS" : "USE"}
            </button>
          )
        ) : (
          <button className="ob-btn st-buy" disabled={busy} onClick={onBuy}>
            {busy ? "OPENING…" : s.price ? dollars(s.price) : "FREE"}
          </button>
        )}
      </div>
    </div>
  );
}

/** The tutorial map's best layout, painted in the previewed colors. */
function MiniBoard({ me, them }: { me: string; them: string }) {
  const { fin, at } = useMemo(() => {
    const pl = solve(DEMO_LAYOUT).placements;
    const at = new Map<number, Kind>(pl.map((p) => [p.i, p.kind]));
    at.set(DEMO_LAYOUT.commander, "commander");
    return { fin: simulate(DEMO_LAYOUT, pl).final, at };
  }, []);
  return (
    <div className="st-board" style={{ gridTemplateColumns: `repeat(${SIZE}, 1fr)` }}>
      {Array.from({ length: CELLS }, (_, i) => {
        const t = DEMO_LAYOUT.terrain[i];
        const k = at.get(i);
        const bg = t === WALL ? "#70757d" : t === WATER ? "#2aa198" : fin[i] ? me : them;
        return (
          <div key={i} className="st-tile" style={{ background: k ? "#f6efdb" : bg, color: me, outline: k ? `2px solid ${me}` : undefined }}>
            {k ? <TroopIcon kind={k} /> : t === TREE ? <span className="st-tree" /> : null}
          </div>
        );
      })}
    </div>
  );
}
