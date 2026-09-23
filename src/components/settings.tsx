"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ViewNav } from "./board";
import { createClient } from "@/utils/supabase/client";
import { RANKS, Insignia } from "@/lib/ranks";

const ENLISTED_RANKS = RANKS.filter((r) => r.tier === "enlisted");
const OFFICER_RANKS = RANKS.filter((r) => r.tier === "officer");

const SKEY = "bg_settings_v1";

interface Prefs {
  email: boolean;
}
const DEFAULT: Prefs = {
  email: true,
};

function Toggle({
  label,
  sub,
  on,
  onToggle,
  disabled,
}: {
  label: string;
  sub?: string;
  on: boolean;
  onToggle?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={
        "st-row st-toggle" + (on ? " on" : "") + (disabled ? " disabled" : "")
      }
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
    >
      <span className="st-label">
        {label}
        {sub && <span className="st-sub"> · {sub}</span>}
      </span>
      <span className="st-switch" aria-hidden="true">
        <span className="st-knob" />
      </span>
    </button>
  );
}

function NavRow({
  label,
  value,
  onClick,
  href,
  danger,
}: {
  label: string;
  value?: string;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
}) {
  const cls = "st-row st-link" + (danger ? " danger" : "");
  const inner = (
    <>
      <span className="st-label">{label}</span>
      {value && <span className="st-value">{value}</span>}
      <span className="st-chev" aria-hidden="true">
        ›
      </span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick}>
      {inner}
    </button>
  );
}

export function Settings() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT);
  const [email, setEmail] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [ranksOpen, setRanksOpen] = useState(false);
  const [activitiesOpen, setActivitiesOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SKEY);
      if (raw) setPrefs({ ...DEFAULT, ...JSON.parse(raw) });
      const p = localStorage.getItem("bg_player_v1");
      if (p) setEmail(JSON.parse(p).email ?? "");
    } catch {
      /* ignore */
    }
  }, []);

  function save(next: Prefs) {
    setPrefs(next);
    try {
      localStorage.setItem(SKEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  const toggle = (k: keyof Prefs) => save({ ...prefs, [k]: !prefs[k] });

  function saveEmail() {
    try {
      const p = JSON.parse(localStorage.getItem("bg_player_v1") || "{}");
      p.email = draft.trim();
      localStorage.setItem("bg_player_v1", JSON.stringify(p));
      setEmail(draft.trim());
    } catch {
      /* ignore */
    }
    setEditing(false);
  }

  async function signOut() {
    try {
      await createClient().auth.signOut();
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem("bg_player_v1");
    } catch {
      /* ignore */
    }
    window.location.href = "/";
  }

  function deleteAccount() {
    if (
      !window.confirm(
        "Delete your account and service record? This can't be undone.",
      )
    )
      return;
    try {
      localStorage.removeItem("bg_player_v1");
      localStorage.removeItem(SKEY);
    } catch {
      /* ignore */
    }
    signOut();
  }

  return (
    <>
      <div className="cartridge settings">
        <Link href="/" className="back-btn" aria-label="Home">
          ‹ HOME
        </Link>
        <header className="bg-header">
          <div className="wordmark">
            <span className="coin">$</span>settings
          </div>
        </header>

        <section className="st-section">
          <h2 className="fm-h">EMAIL DISPATCHES</h2>
          <Toggle
            label="Email dispatches"
            sub="orders, promotions & battle alerts"
            on={prefs.email}
            onToggle={() => toggle("email")}
          />
          <p className="st-note">
            One switch covers every dispatch. Turn it off and we&apos;ll stand
            down — no field emails.
          </p>
        </section>

        <section className="st-section">
          <h2 className="fm-h">BILLING</h2>
          <NavRow label="Payment method" value="None on file" />
          <NavRow label="Receipts &amp; history" value="View" href="/receipts" />
        </section>

        <section className="st-section">
          <h2 className="fm-h">ACCOUNT</h2>
          {editing ? (
            <div className="st-emailedit">
              <input
                className="ob-input"
                type="email"
                value={draft}
                placeholder="you@email.com"
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveEmail();
                }}
              />
              <button type="button" className="ob-btn" onClick={saveEmail}>
                SAVE
              </button>
              <p className="st-note">
                ✉ Saving an email opts you in to field dispatches. Stand down
                anytime with the switch above.
              </p>
            </div>
          ) : (
            <NavRow
              label="Email"
              value={email || "not set"}
              onClick={() => {
                setDraft(email);
                setEditing(true);
              }}
            />
          )}
          <NavRow label="Sign out" onClick={signOut} />
          <NavRow label="Delete account" danger onClick={deleteAccount} />
        </section>

        <section className="st-section">
          <h2 className="fm-h">PROMOTIONS</h2>

          <button
            type="button"
            className="st-row st-link"
            aria-expanded={ranksOpen}
            onClick={() => setRanksOpen((v) => !v)}
          >
            <span className="st-label">Ranks</span>
            <span className={"st-chev" + (ranksOpen ? " open" : "")} aria-hidden="true">
              ›
            </span>
          </button>
          {ranksOpen && (
            <div className="st-acc-body">
              <p className="st-note">
                You start as a Recruit (0 pts). Your first flip earns Private (3
                pts); a return or another flip makes you PFC (4). Reach each
                threshold to earn the rank.
              </p>
              <div className="rk-list">
                {ENLISTED_RANKS.map((r) => (
                  <div className="rk-row" key={r.key}>
                    <span className="rk-ins">
                      <Insignia ins={r.insignia} size={26} />
                    </span>
                    <span className="rk-name">{r.name}</span>
                    <span className="rk-req">{r.req} pts</span>
                  </div>
                ))}
              </div>
              <h3 className="rk-sub">OFFICER CORPS · commission with a paid strike ($5+)</h3>
              <div className="rk-list">
                {OFFICER_RANKS.map((r) => (
                  <div className="rk-row" key={r.key}>
                    <span className="rk-ins">
                      <Insignia ins={r.insignia} size={26} />
                    </span>
                    <span className="rk-name">{r.name}</span>
                    <span className="rk-req">{r.req} pts</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            className="st-row st-link"
            aria-expanded={activitiesOpen}
            onClick={() => setActivitiesOpen((v) => !v)}
          >
            <span className="st-label">Activities</span>
            <span className={"st-chev" + (activitiesOpen ? " open" : "")} aria-hidden="true">
              ›
            </span>
          </button>
          {activitiesOpen && (
            <div className="st-acc-body">
              <div className="rk-legend">
                <h3 className="rk-legend-h">WHAT EARNS POINTS</h3>
                <div className="rk-leg-row">
                  <span className="rk-leg-pt">+3</span>
                  <span>Flip a tile</span>
                  <span className="rk-leg-sub">each tile you flip</span>
                </div>
                <div className="rk-leg-row">
                  <span className="rk-leg-pt">+1</span>
                  <span>Report for duty</span>
                  <span className="rk-leg-sub">each return, 8+ hours apart</span>
                </div>
                <p className="st-note">
                  Your rank climbs on points from the field — flips and showing up.
                  Commission into the Officer Corps with your first paid strike ($5+).
                </p>
              </div>
            </div>
          )}
        </section>

        <section className="st-section">
          <h2 className="fm-h">LEGAL</h2>
          <NavRow
            label="Terms, Privacy &amp; Refunds"
            value="View"
            href="/legal"
          />
        </section>
      </div>

      <ViewNav active="/settings" />
    </>
  );
}
