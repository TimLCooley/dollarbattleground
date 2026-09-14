"use client";

import { useCallback, useEffect, useState } from "react";

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

function status(actions: number): { label: string; cls: string } {
  if (actions >= 10) return { label: "WHALE", cls: "whale" };
  if (actions >= 3) return { label: "ACTIVE", cls: "active" };
  if (actions > 0) return { label: "ENGAGED", cls: "engaged" };
  return { label: "NEW", cls: "lurker" };
}

export function AdminTiles() {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [cellMode, setCellMode] = useState(false);
  const [x, setX] = useState("");
  const [y, setY] = useState("");

  const load = useCallback(async (qx?: string, qy?: string) => {
    setRows(null);
    const params =
      qx !== undefined && qy !== undefined && qx !== "" && qy !== ""
        ? `?x=${encodeURIComponent(qx)}&y=${encodeURIComponent(qy)}`
        : "";
    const res = await fetch("/api/admin/tile-log" + params);
    if (res.ok) {
      const d = await res.json();
      setRows(d.rows);
      setCellMode(d.cellMode);
    } else {
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="tl">
      <div className="tl-toolbar">
        <span className="tl-label">CELL HISTORY</span>
        <input
          className="tl-coord"
          placeholder="x"
          inputMode="numeric"
          value={x}
          onChange={(e) => setX(e.target.value.replace(/\D/g, "").slice(0, 2))}
        />
        <input
          className="tl-coord"
          placeholder="y"
          inputMode="numeric"
          value={y}
          onChange={(e) => setY(e.target.value.replace(/\D/g, "").slice(0, 2))}
        />
        <button className="tl-btn" onClick={() => load(x, y)} disabled={!x || !y}>
          LOOK UP
        </button>
        <button
          className="tl-btn tl-recent"
          onClick={() => {
            setX("");
            setY("");
            load();
          }}
        >
          RECENT
        </button>
      </div>

      <h2 className="tl-h">
        {cellMode ? `◆ HISTORY OF (${x}, ${y}) — all owners` : "◆ RECENT FLIPS"}
      </h2>

      {!rows ? (
        <p className="adm-loading">Loading tile log…</p>
      ) : rows.length === 0 ? (
        <p className="adm-loading">
          {cellMode ? "No history for that cell yet." : "No flips logged yet."}
        </p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Cell</th>
                <th className="c">Team</th>
                <th>Owner</th>
                <th className="c">Status</th>
                <th className="r">Actions</th>
                <th className="c">Via</th>
                <th className="r">When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    ({r.x}, {r.y})
                  </td>
                  <td className="c">
                    <span className={"adm-side adm-" + r.team}>
                      {r.team.toUpperCase()}
                    </span>
                  </td>
                  <td>{r.owner}</td>
                  <td className="c">
                    {(() => {
                      const s = status(r.ownerActions);
                      return <span className={"adm-badge adm-" + s.cls}>{s.label}</span>;
                    })()}
                  </td>
                  <td className="r">
                    {r.ownerActions > 0 ? (
                      <span className="adm-actions-pts">{r.ownerActions}</span>
                    ) : (
                      <span className="adm-dim">0</span>
                    )}
                  </td>
                  <td className="c adm-dim">{r.source}</td>
                  <td className="r adm-dim">
                    {new Date(r.created).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
