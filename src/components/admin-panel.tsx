"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SpendConfirm, type PendingSpend } from "./spend-confirm";

interface RosterRow {
  id: string;
  email: string | null;
  team: string | null;
  isAdmin: boolean;
  created: string;
  held: number;
  spent: number;
  purchases: number;
  actions: number;
  lastActionAt: string | null;
  freeUsed: boolean;
  score: number;
}
interface Summary {
  users: number;
  active: number;
  revenue: number;
  payers: number;
}

type Dir = "asc" | "desc";

interface Column {
  key: string;
  label: string;
  align?: "right" | "center";
  sort: (r: RosterRow) => number | string;
  render: (r: RosterRow) => ReactNode;
}

function activity(score: number): { label: string; cls: string } {
  if (score >= 100) return { label: "WHALE", cls: "whale" };
  if (score >= 20) return { label: "ACTIVE", cls: "active" };
  if (score > 0) return { label: "ENGAGED", cls: "engaged" };
  return { label: "LURKER", cls: "lurker" };
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}

const COLUMNS: Column[] = [
  {
    key: "player",
    label: "Player",
    sort: (r) => (r.email ?? "zzz" + r.id).toLowerCase(),
    render: (r) =>
      r.email ? (
        <span className="adm-email">{r.email}</span>
      ) : (
        <span className="adm-anon">anon · {r.id.slice(0, 8)}</span>
      ),
  },
  {
    key: "team",
    label: "Side",
    align: "center",
    sort: (r) => r.team ?? "",
    render: (r) =>
      r.team ? (
        <span className={"adm-side adm-" + r.team}>{r.team.toUpperCase()}</span>
      ) : (
        <span className="adm-dim">—</span>
      ),
  },
  {
    key: "activity",
    label: "Activity",
    align: "center",
    sort: (r) => r.score,
    render: (r) => {
      const a = activity(r.score);
      return <span className={"adm-badge adm-" + a.cls}>{a.label}</span>;
    },
  },
  {
    key: "spent",
    label: "Spent",
    align: "right",
    sort: (r) => r.spent,
    render: (r) =>
      r.spent > 0 ? (
        <span className="adm-money">${r.spent.toFixed(2)}</span>
      ) : (
        <span className="adm-dim">$0</span>
      ),
  },
  {
    key: "purchases",
    label: "Buys",
    align: "right",
    sort: (r) => r.purchases,
    render: (r) => <span>{r.purchases}</span>,
  },
  {
    key: "held",
    label: "Held",
    align: "right",
    sort: (r) => r.held,
    render: (r) => <span>{r.held}</span>,
  },
  {
    key: "actions",
    label: "Actions",
    align: "right",
    sort: (r) => r.actions,
    render: (r) =>
      r.actions > 0 ? (
        <span className="adm-actions-pts">{r.actions}</span>
      ) : (
        <span className="adm-dim">0</span>
      ),
  },
  {
    key: "score",
    label: "Score",
    align: "right",
    sort: (r) => r.score,
    render: (r) => <span className="adm-score">{r.score}</span>,
  },
  {
    key: "free",
    label: "Free",
    align: "center",
    sort: (r) => (r.freeUsed ? 1 : 0),
    render: (r) => (r.freeUsed ? "✓" : <span className="adm-dim">–</span>),
  },
  {
    key: "admin",
    label: "Admin",
    align: "center",
    sort: (r) => (r.isAdmin ? 1 : 0),
    render: (r) => (r.isAdmin ? <span className="adm-star">★</span> : <span className="adm-dim">–</span>),
  },
  {
    key: "created",
    label: "Joined",
    align: "right",
    sort: (r) => r.created,
    render: (r) => <span className="adm-dim">{fmtDate(r.created)}</span>,
  },
];

export function AdminPanel() {
  const [rows, setRows] = useState<RosterRow[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState("score");
  const [dir, setDir] = useState<Dir>("desc");
  const [order, setOrder] = useState<string[]>(COLUMNS.map((c) => c.key));
  const [dragKey, setDragKey] = useState<string | null>(null);

  // Stripe mode toggle
  const [mode, setMode] = useState<"test" | "live" | null>(null);
  const [liveOk, setLiveOk] = useState(false);
  const [modeMsg, setModeMsg] = useState<string | null>(null);

  // Test checkout — opens the real SpendConfirm/Stripe flow (test mode)
  const [testPay, setTestPay] = useState<PendingSpend | null>(null);
  const [payMsg, setPayMsg] = useState<string | null>(null);
  const TEST_ORDERS: { label: string; order: PendingSpend }[] = [
    { label: "$1 · single", order: { kind: "flip", amount: 1, tiles: 1, side: "red", center: 112 } },
    { label: "$5 · 2×2", order: { kind: "x", amount: 5, tiles: 4, side: "red", center: 112 } },
    { label: "$10 · 3×3", order: { kind: "strike", amount: 10, tiles: 9, side: "red", center: 112 } },
  ];

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/users");
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
        const data = await res.json();
        setRows(data.rows);
        setSummary(data.summary);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load roster");
      }
      try {
        const m = await fetch("/api/admin/stripe-mode").then((r) => r.json());
        setMode(m.mode);
        setLiveOk(m.liveConfigured);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const columns = useMemo(
    () => order.map((k) => COLUMNS.find((c) => c.key === k)!).filter(Boolean),
    [order],
  );

  const view = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    const col = COLUMNS.find((c) => c.key === sortKey) ?? COLUMNS[0];
    const filtered = q
      ? rows.filter(
          (r) =>
            (r.email ?? "").toLowerCase().includes(q) ||
            (r.team ?? "").toLowerCase().includes(q) ||
            r.id.toLowerCase().includes(q),
        )
      : rows;
    const sorted = [...filtered].sort((a, b) => {
      const av = col.sort(a);
      const bv = col.sort(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return dir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [rows, query, sortKey, dir]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setDir("desc");
    }
  }

  function onDrop(target: string) {
    if (!dragKey || dragKey === target) return;
    setOrder((prev) => {
      const next = [...prev];
      const from = next.indexOf(dragKey);
      const to = next.indexOf(target);
      next.splice(from, 1);
      next.splice(to, 0, dragKey);
      return next;
    });
    setDragKey(null);
  }

  async function switchMode(next: "test" | "live") {
    setModeMsg(null);
    const res = await fetch("/api/admin/stripe-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: next }),
    });
    const data = await res.json();
    if (!res.ok) {
      setModeMsg(data.error ?? "Couldn't switch mode");
      return;
    }
    setMode(data.mode);
  }

  return (
    <>
      {/* Stripe mode */}
      <section className="adm-mode">
        <span className="adm-mode-label">STRIPE</span>
        <div className="adm-toggle" role="group" aria-label="Stripe mode">
          <button
            className={"adm-toggle-opt" + (mode === "test" ? " on" : "")}
            onClick={() => switchMode("test")}
            disabled={mode === null}
          >
            TEST
          </button>
          <button
            className={
              "adm-toggle-opt live" + (mode === "live" ? " on" : "")
            }
            onClick={() => switchMode("live")}
            disabled={mode === null || !liveOk}
            title={liveOk ? "" : "Live keys not configured"}
          >
            LIVE
          </button>
        </div>
        <span className={"adm-mode-state " + (mode ?? "")}>
          {mode === "live" ? "● LIVE — real charges" : mode === "test" ? "● test mode" : "…"}
        </span>
        {!liveOk && (
          <span className="adm-mode-note">
            Live disabled — add STRIPE_SECRET_KEY_LIVE + publishable
          </span>
        )}
        {modeMsg && <span className="adm-mode-err">{modeMsg}</span>}
      </section>

      {/* Test checkout — feel the real payment flow (uses the current Stripe mode) */}
      <section className="adm-mode">
        <span className="adm-mode-label">TEST CHECKOUT</span>
        <div className="adm-toggle" role="group" aria-label="Test checkout">
          {TEST_ORDERS.map((t) => (
            <button
              key={t.label}
              className="adm-toggle-opt"
              onClick={() => {
                setPayMsg(null);
                setTestPay(t.order);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="adm-mode-note">
          {mode === "live"
            ? "⚠ LIVE mode — a real charge. Switch to TEST for card 4242…"
            : "Opens the live checkout in test mode (use card 4242 4242 4242 4242)."}
        </span>
        {payMsg && <span className="adm-mode-state test">{payMsg}</span>}
      </section>

      {testPay && (
        <SpendConfirm
          pending={testPay}
          onConfirm={() => {
            setTestPay(null);
            setPayMsg("✓ Test purchase completed.");
          }}
          onCancel={() => setTestPay(null)}
        />
      )}

      {/* Summary */}
      {summary && (
        <section className="adm-stats">
          <div className="adm-stat">
            <span className="adm-stat-n">{summary.users}</span>
            <span className="adm-stat-l">players</span>
          </div>
          <div className="adm-stat">
            <span className="adm-stat-n">{summary.active}</span>
            <span className="adm-stat-l">active</span>
          </div>
          <div className="adm-stat">
            <span className="adm-stat-n">{summary.payers}</span>
            <span className="adm-stat-l">payers</span>
          </div>
          <div className="adm-stat">
            <span className="adm-stat-n gold">${summary.revenue.toFixed(2)}</span>
            <span className="adm-stat-l">revenue</span>
          </div>
        </section>
      )}

      <div className="adm-toolbar">
        <input
          className="adm-search"
          placeholder="Search email, side, id…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="adm-count">{view.length} shown</span>
      </div>

      {error ? (
        <p className="adm-error">{error}</p>
      ) : !rows ? (
        <p className="adm-loading">Loading roster…</p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={
                      (c.align === "right"
                        ? "r "
                        : c.align === "center"
                          ? "c "
                          : "") + (sortKey === c.key ? "sorted" : "")
                    }
                    draggable
                    onDragStart={() => setDragKey(c.key)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => onDrop(c.key)}
                    onClick={() => toggleSort(c.key)}
                    title="Click to sort · drag to reorder"
                  >
                    {c.label}
                    {sortKey === c.key && (
                      <span className="adm-arrow">
                        {dir === "asc" ? " ▲" : " ▼"}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.map((r) => (
                <tr key={r.id}>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={
                        c.align === "right" ? "r" : c.align === "center" ? "c" : ""
                      }
                    >
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
