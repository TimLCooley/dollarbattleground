"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

interface Post {
  id: number;
  copy: string;
  faction: string | null;
  x_account: string | null;
  angle: string | null;
  format: string;
  external_id: string | null;
  posted_at: string | null;
  impressions: number | null;
  likes: number | null;
  reposts: number | null;
  replies: number | null;
  quotes: number | null;
  clicks: number | null;
  metrics_at: string | null;
}

function fmt(n: number | null): string {
  const v = n ?? 0;
  return v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, "") + "K" : String(v);
}
function sideOf(p: Post): "red" | "blue" {
  return p.faction === "blue" || p.x_account === "blue" ? "blue" : "red";
}
function xUrl(p: Post): string {
  return p.external_id ? `https://x.com/i/status/${p.external_id}` : "#";
}

export function SocialCalendar() {
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/calendar");
    setPosts(r.ok ? (await r.json()).posts : []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      if (r.ok) setPosts((await r.json()).posts);
    } finally {
      setBusy(false);
    }
  }

  const totals = useMemo(() => {
    const p = posts ?? [];
    const sum = (f: (x: Post) => number | null) => p.reduce((a, x) => a + (f(x) ?? 0), 0);
    return {
      posts: p.length,
      impressions: sum((x) => x.impressions),
      likes: sum((x) => x.likes),
      reposts: sum((x) => x.reposts),
      replies: sum((x) => x.replies),
      clicks: sum((x) => x.clicks),
    };
  }, [posts]);

  // calendar grid: 6 weeks starting Sunday
  const grid = useMemo(() => {
    const first = new Date(month);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    const byDay = new Map<string, Post[]>();
    for (const p of posts ?? []) {
      if (!p.posted_at) continue;
      const k = new Date(p.posted_at).toDateString();
      (byDay.get(k) ?? byDay.set(k, []).get(k)!).push(p);
    }
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return { date: d, inMonth: d.getMonth() === month.getMonth(), posts: byDay.get(d.toDateString()) ?? [] };
    });
  }, [posts, month]);

  return (
    <div className="sc">
      <div className="sc-bar">
        <div className="sc-toggle">
          <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}>List</button>
          <button className={view === "calendar" ? "on" : ""} onClick={() => setView("calendar")}>Calendar</button>
        </div>
        <div className="sc-totals">
          <span><b>{totals.posts}</b> posts</span>
          <span>👁 {fmt(totals.impressions)}</span>
          <span>♥ {fmt(totals.likes)}</span>
          <span>🔁 {fmt(totals.reposts)}</span>
          <span>💬 {fmt(totals.replies)}</span>
          <span className="sc-clicks">🔗 {fmt(totals.clicks)} clicks</span>
        </div>
        <button className="tl-btn" onClick={refresh} disabled={busy}>
          {busy ? "Syncing…" : "↻ Refresh metrics"}
        </button>
      </div>

      {!posts ? (
        <p className="adm-loading">Loading…</p>
      ) : posts.length === 0 ? (
        <p className="adm-loading">Nothing posted yet — publish from the Agents tab.</p>
      ) : view === "list" ? (
        <div className="adm-table-wrap">
          <table className="adm-table sc-table">
            <thead>
              <tr>
                <th>When</th><th className="c">Team</th><th className="c">Angle</th><th>Post</th>
                <th className="r">👁</th><th className="r">♥</th><th className="r">🔁</th><th className="r">💬</th><th className="r">🔗</th><th></th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id}>
                  <td className="adm-dim">{p.posted_at ? new Date(p.posted_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}</td>
                  <td className="c">{sideOf(p) === "blue" ? "🔵" : "🔴"}</td>
                  <td className="c">{p.angle && <span className={"cc-angle a-" + p.angle}>{p.angle}</span>}</td>
                  <td className="sc-copy">{p.copy}</td>
                  <td className="r">{fmt(p.impressions)}</td>
                  <td className="r">{fmt(p.likes)}</td>
                  <td className="r">{fmt(p.reposts)}</td>
                  <td className="r">{fmt(p.replies)}</td>
                  <td className="r"><b>{fmt(p.clicks)}</b></td>
                  <td className="r">{p.external_id && <a className="xlink" href={xUrl(p)} target="_blank" rel="noreferrer">↗</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="sc-cal">
          <div className="sc-cal-head">
            <button className="tl-btn tl-recent" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
            <span className="sc-cal-month">{month.toLocaleString([], { month: "long", year: "numeric" })}</span>
            <button className="tl-btn tl-recent" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
          </div>
          <div className="sc-grid">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <div key={i} className="sc-dow">{d}</div>
            ))}
            {grid.map((cell, i) => (
              <div key={i} className={"sc-day" + (cell.inMonth ? "" : " out")}>
                <span className="sc-daynum">{cell.date.getDate()}</span>
                {cell.posts.map((p) => (
                  <a
                    key={p.id}
                    className={"sc-chip " + sideOf(p)}
                    href={xUrl(p)}
                    target="_blank"
                    rel="noreferrer"
                    title={`${p.angle ?? ""} · 👁 ${fmt(p.impressions)} ♥ ${fmt(p.likes)}\n${p.copy}`}
                  >
                    {sideOf(p) === "blue" ? "🔵" : "🔴"} {fmt(p.impressions)}
                  </a>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
