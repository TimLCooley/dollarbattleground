"use client";

import { useCallback, useEffect, useState } from "react";
import { useBattleground } from "./board";

const N = 15;
const DAY = 86_400_000;

interface LogRow {
  id: number;
  x: number;
  y: number;
  team: string;
  source: string;
  created: string;
  owner: string;
  ownerActions: number;
}
interface HotRow {
  x: number;
  y: number;
  flips: number;
  red: number;
  blue: number;
  team: string;
  last: string;
}
type Range = "week" | "month" | "year" | "all" | "custom";
const RANGE_LABEL: Record<Range, string> = {
  week: "Week",
  month: "Month",
  year: "Year",
  all: "All",
  custom: "Range",
};

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function pct(n: number, total: number): string {
  return total ? `${(n / total) * 100}%` : "0%";
}

export function AdminTiles() {
  // Live board — same source players see, so ownership colors stay current.
  const { cells } = useBattleground();
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [sel, setSel] = useState<{ x: number; y: number } | null>(null);

  const [hot, setHot] = useState<HotRow[] | null>(null);
  const [range, setRange] = useState<Range>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [simBusy, setSimBusy] = useState(false);
  const [simMsg, setSimMsg] = useState<string | null>(null);

  const load = useCallback(async (cell?: { x: number; y: number }) => {
    setRows(null);
    const params = cell ? `?x=${cell.x}&y=${cell.y}` : "";
    const res = await fetch("/api/admin/tile-log" + params);
    setRows(res.ok ? (await res.json()).rows : []);
  }, []);

  const loadHot = useCallback(async (r: Range, f?: string, t?: string) => {
    setHot(null);
    const now = Date.now();
    let since = "";
    let until = "";
    if (r === "week") since = new Date(now - 7 * DAY).toISOString();
    else if (r === "month") since = new Date(now - 30 * DAY).toISOString();
    else if (r === "year") since = new Date(now - 365 * DAY).toISOString();
    else if (r === "custom") {
      if (f) since = new Date(f + "T00:00:00").toISOString();
      if (t) until = new Date(t + "T23:59:59").toISOString();
    }
    const p = new URLSearchParams({ hot: "1" });
    if (since) p.set("since", since);
    if (until) p.set("until", until);
    const res = await fetch("/api/admin/tile-log?" + p.toString());
    setHot(res.ok ? (await res.json()).rows : []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (range !== "custom") loadHot(range);
    else if (from || to) loadHot("custom", from, to);
  }, [range, from, to, loadHot]);

  function pick(x: number, y: number) {
    const c = { x, y };
    setSel(c);
    load(c);
  }
  function recent() {
    setSel(null);
    load();
  }

  async function simulate() {
    if (
      !window.confirm(
        "Add simulated battle history to the board? This is test data — wipe it before you go live.",
      )
    )
      return;
    setSimBusy(true);
    setSimMsg(null);
    try {
      const res = await fetch("/api/admin/simulate", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setSimMsg(`✓ Seeded ${d.events} flips across ${d.cells} cells (${d.players} players).`);
        loadHot(range, from, to);
        recent();
      } else {
        setSimMsg(`⚠ ${d.error ?? "Failed"}`);
      }
    } catch (e) {
      setSimMsg(`⚠ ${e instanceof Error ? e.message : "Failed"}`);
    } finally {
      setSimBusy(false);
    }
  }

  return (
    <div className="tl">
      <div className="tl-simbar">
        <button className="tl-btn" onClick={simulate} disabled={simBusy} type="button">
          {simBusy ? "Simulating…" : "⚙ Simulate board"}
        </button>
        {simMsg && <span className="tl-simmsg">{simMsg}</span>}
      </div>

      <div className="tl-layout">
        {/* Clickable board — tap a tile to pull its full history */}
        <div className="tl-boardwrap">
          <div className="tl-board" role="grid" aria-label="Board — tap a tile">
            {cells.map((v, i) => {
              const x = i % N;
              const y = Math.floor(i / N);
              const on = sel?.x === x && sel?.y === y;
              return (
                <button
                  key={i}
                  type="button"
                  className={
                    "tl-cell " +
                    (v === "red" ? "tl-red" : v === "blue" ? "tl-blue" : "tl-none") +
                    (on ? " sel" : "")
                  }
                  title={`(${x}, ${y})`}
                  aria-label={`cell ${x}, ${y}`}
                  onClick={() => pick(x, y)}
                />
              );
            })}
          </div>
          <p className="tl-hint">
            {sel ? (
              <>
                Cell <b>({sel.x}, {sel.y})</b> selected —{" "}
              </>
            ) : (
              "Tap a tile to see what's happened there — "
            )}
            <button type="button" className="tl-inline" onClick={recent}>
              show recent flips
            </button>
          </p>
        </div>

        {/* History (condensed) */}
        <div className="tl-history">
          <h2 className="tl-h">
            {sel ? `◆ (${sel.x}, ${sel.y}) — ALL OWNERS` : "◆ RECENT FLIPS"}
          </h2>
          {!rows ? (
            <p className="adm-loading">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="adm-loading">
              {sel ? "No history for that cell yet." : "No flips logged yet."}
            </p>
          ) : (
            <div className="adm-table-wrap">
              <table className="adm-table tl-table">
                <thead>
                  <tr>
                    {!sel && <th>Cell</th>}
                    <th className="c">Team</th>
                    <th>Owner</th>
                    <th className="c">Via</th>
                    <th className="r">When</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      {!sel && (
                        <td>
                          ({r.x}, {r.y})
                        </td>
                      )}
                      <td className="c">
                        <span className={"adm-side adm-" + r.team}>
                          {r.team.toUpperCase()}
                        </span>
                      </td>
                      <td>{r.owner}</td>
                      <td className="c adm-dim">{r.source}</td>
                      <td className="r adm-dim">{fmtWhen(r.created)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Most fought-for tiles, by flip count, within a date range */}
      <section className="tl-hot">
        <div className="tl-hot-head">
          <h2 className="tl-h">◆ MOST FOUGHT-FOR TILES</h2>
          <div className="tl-ranges">
            {(Object.keys(RANGE_LABEL) as Range[]).map((r) => (
              <button
                key={r}
                type="button"
                className={"tl-range" + (range === r ? " on" : "")}
                onClick={() => setRange(r)}
              >
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
        {range === "custom" && (
          <div className="tl-custom">
            <input
              type="date"
              className="tl-date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <span className="tl-arrow">→</span>
            <input
              type="date"
              className="tl-date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        )}
        {!hot ? (
          <p className="adm-loading">Loading…</p>
        ) : hot.length === 0 ? (
          <p className="adm-loading">No flips in this range yet.</p>
        ) : (
          <ol className="tl-hotlist">
            {hot.map((h, i) => (
              <li key={`${h.x},${h.y}`}>
                <button type="button" className="tl-hotrow" onClick={() => pick(h.x, h.y)}>
                  <span className="tl-rank">{i + 1}</span>
                  <span className="tl-hotcell">
                    ({h.x}, {h.y})
                  </span>
                  <span className="tl-hotbar" aria-hidden="true">
                    <span className="tl-hotbar-b" style={{ width: pct(h.blue, h.flips) }} />
                    <span className="tl-hotbar-r" style={{ width: pct(h.red, h.flips) }} />
                  </span>
                  <span className="tl-hotflips">
                    <b>{h.flips}</b> flips
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
