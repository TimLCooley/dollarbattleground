"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ViewNav } from "./board";
import { createClient } from "@/utils/supabase/client";

const SKEY = "bg_settings_v1";

interface Prefs {
  email: boolean;
  catTerritory: boolean;
  catPromotion: boolean;
  catBattle: boolean;
  sms: boolean;
}
const DEFAULT: Prefs = {
  email: true,
  catTerritory: true,
  catPromotion: true,
  catBattle: false,
  sms: false,
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
  danger,
}: {
  label: string;
  value?: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={"st-row st-link" + (danger ? " danger" : "")}
      onClick={onClick}
    >
      <span className="st-label">{label}</span>
      {value && <span className="st-value">{value}</span>}
      <span className="st-chev" aria-hidden="true">
        ›
      </span>
    </button>
  );
}

export function Settings() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT);
  const [email, setEmail] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

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
        <header className="bg-header">
          <div className="wordmark">
            <span className="coin">$</span>settings
          </div>
        </header>

        <section className="st-section">
          <h2 className="fm-h">BATTLE ALERTS</h2>
          <Toggle
            label="Email alerts"
            on={prefs.email}
            onToggle={() => toggle("email")}
          />
          <Toggle
            label="My territory attacked"
            on={prefs.catTerritory}
            onToggle={() => toggle("catTerritory")}
            disabled={!prefs.email}
          />
          <Toggle
            label="Promotions"
            on={prefs.catPromotion}
            onToggle={() => toggle("catPromotion")}
            disabled={!prefs.email}
          />
          <Toggle
            label="Major battle events"
            on={prefs.catBattle}
            onToggle={() => toggle("catBattle")}
            disabled={!prefs.email}
          />
        </section>

        <section className="st-section">
          <h2 className="fm-h">TEXT ALERTS</h2>
          <Toggle label="SMS alerts" sub="coming soon" on={prefs.sms} disabled />
        </section>

        <section className="st-section">
          <h2 className="fm-h">BILLING</h2>
          <NavRow label="Payment method" value="None on file" />
          <NavRow label="Payment history" value="—" />
        </section>

        <section className="st-section">
          <h2 className="fm-h">HISTORY</h2>
          <NavRow label="Action history" value="View" />
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
          <h2 className="fm-h">LEGAL</h2>
          <NavRow label="Terms of Service" />
          <NavRow label="Privacy Policy" />
          <NavRow label="Cookie Policy" />
          <NavRow label="Refund Policy" />
        </section>
      </div>

      <ViewNav active="/settings" />
    </>
  );
}
