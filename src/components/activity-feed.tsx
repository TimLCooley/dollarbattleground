"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// The ACTIVITY tab: a live feed of the funnel — signups, purchases, takeovers,
// every email that went out, every post published or denied — with 24h / 7d
// counts. Refreshes itself every 30s.

interface Row {
  id: number;
  kind: string;
  faction: string | null;
  summary: string;
  meta: Record<string, unknown> | null;
  created_at: string;
}
interface Counts {
  d1: Record<string, number>;
  d7: Record<string, number>;
}

const GROUPS: { key: string; label: string; icon: string }[] = [
  { key: "all", label: "ALL", icon: "" },
  { key: "player_new", label: "SIGNUPS", icon: "🪖" },
  { key: "waitlist_new", label: "WAITLIST", icon: "📝" },
  { key: "purchase", label: "PURCHASES", icon: "💵" },
  { key: "takeover", label: "TAKEOVERS", icon: "⚔️" },
  { key: "email", label: "EMAILS", icon: "✉️" },
  { key: "post", label: "POSTS", icon: "📣" },
];

const ICON: Record<string, string> = {
  player_new: "🪖",
  waitlist_new: "📝",
  purchase: "💵",
  takeover: "⚔️",
  email_takeover: "✉️",
  email_reminder: "⏰",
  email_waitlist: "📨",
  post_published: "📣",
  post_denied: "✕",
};

function ago(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function sumGroup(c: Record<string, number>, key: string): number {
  return Object.entries(c).reduce((s, [k, n]) => (key === "all" || k === key || k.startsWith(key + "_") ? s + n : s), 0);
}

export function ActivityFeed() {
  const [group, setGroup] = useState("all");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (g: string) => {
    try {
      const r = await fetch(`/api/admin/activity?kind=${g}&limit=200`);
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed");
      const d = (await r.json()) as { rows: Row[]; counts: Counts };
      setRows(d.rows);
      setCounts(d.counts);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load activity");
    }
  }, []);

  useEffect(() => {
    load(group);
    const t = setInterval(() => load(group), 30_000);
    return () => clearInterval(t);
  }, [group, load]);

  const totals = useMemo(() => {
    if (!counts) return null;
    return GROUPS.filter((g) => g.key !== "all").map((g) => ({ ...g, d1: sumGroup(counts.d1, g.key), d7: sumGroup(counts.d7, g.key) }));
  }, [counts]);

  return (
    <div className="af">
      {totals && (
        <div className="af-counts">
          {totals.map((t) => (
            <button key={t.key} className={"af-count" + (group === t.key ? " on" : "")} onClick={() => setGroup(group === t.key ? "all" : t.key)}>
              <span className="af-count-n">{t.d1}</span>
              <span className="af-count-l">{t.icon} {t.label} today</span>
              <span className="af-count-w">{t.d7} this week</span>
            </button>
          ))}
        </div>
      )}

      <div className="af-bar">
        <div className="af-chips">
          {GROUPS.map((g) => (
            <button key={g.key} className={"af-chip" + (group === g.key ? " on" : "")} onClick={() => setGroup(g.key)}>
              {g.label}
            </button>
          ))}
        </div>
        <span className="af-note">Live — refreshes every 30s. You also get a digest email each tick when there&apos;s something new.</span>
      </div>

      {err && <p className="ct-error">{err}</p>}
      {!rows ? (
        <p className="adm-loading">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="cc-empty">Nothing yet. The moment someone signs up, buys, gets taken over, or a dispatch goes out, it shows here.</p>
      ) : (
        <ul className="af-list">
          {rows.map((r) => (
            <li key={r.id} className="af-row" data-faction={r.faction ?? ""}>
              <span className="af-ico">{ICON[r.kind] ?? "•"}</span>
              <span className="af-sum">{r.summary}</span>
              <span className="af-time" title={new Date(r.created_at).toLocaleString()}>
                {ago(r.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
