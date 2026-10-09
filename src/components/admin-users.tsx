"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlayerRow } from "@/app/api/admin/players/route";

// USERS: every player and waitlist address — side, founder #, joined, last
// active, tiles held, power-ups in the bank — with grant buttons and a message box.

function ago(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

type SortKey = "email" | "side" | "status" | "rank" | "joined" | "lastActive" | "held" | "strikes" | "blocks" | "singles";
const STATUS_ORDER: Record<PlayerRow["status"], number> = { active: 0, verified: 1, pending: 2, waitlist: 3 };

export function AdminUsers() {
  const [rows, setRows] = useState<PlayerRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msgFor, setMsgFor] = useState<PlayerRow | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "status", dir: 1 });

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/players");
    const d = await r.json();
    if (!r.ok) setErr(d.error ?? "Failed");
    else setRows(d.players);
  }, []);
  useEffect(() => {
    load().catch(() => setErr("Failed to load"));
  }, [load]);

  async function grant(p: PlayerRow, kind: "strikes" | "blocks" | "singles") {
    if (!p.id) return;
    setBusy(`${p.email}-${kind}`);
    const r = await fetch("/api/admin/players", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "grant", id: p.id, [kind]: 1 }) });
    const d = await r.json();
    setBusy(null);
    if (!r.ok) setErr(d.error ?? "Failed");
    else load();
  }

  const [asLink, setAsLink] = useState<{ email: string; url: string } | null>(null);
  async function viewAs(p: PlayerRow) {
    setBusy(`as-${p.email}`);
    const r = await fetch("/api/admin/players", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "impersonate", id: p.id, email: p.email }) });
    const d = await r.json();
    setBusy(null);
    if (!r.ok) setErr(d.error ?? "Failed");
    else {
      setAsLink({ email: p.email, url: d.url });
      try {
        await navigator.clipboard.writeText(d.url);
      } catch {
        /* shown below */
      }
    }
  }

  async function send() {
    if (!msgFor) return;
    setBusy("msg");
    const r = await fetch("/api/admin/players", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "message", id: msgFor.id, email: msgFor.email, subject, message }) });
    const d = await r.json();
    setBusy(null);
    if (!r.ok) setErr(d.error ?? "Failed");
    else {
      setNote(`Sent to ${msgFor.email}`);
      setMsgFor(null);
      setSubject("");
      setMessage("");
    }
  }

  const players = rows?.filter((r) => r.status === "active") ?? [];
  const others = rows?.filter((r) => r.status === "verified" || r.status === "pending") ?? [];
  const waitlist = rows?.filter((r) => r.status === "waitlist") ?? [];

  // search (any column, as you type) + click-to-sort headers
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (rows ?? []).filter((p) =>
      !needle ||
      [p.email, p.side, p.status, p.rank, p.nextRank, p.founder ? `founder #${p.founder}` : ""].some((v) => (v ?? "").toString().toLowerCase().includes(needle)),
    );
    const val = (p: PlayerRow): string | number => {
      switch (sort.key) {
        case "email": return p.email.toLowerCase();
        case "side": return p.side ?? "~";
        case "status": return STATUS_ORDER[p.status];
        case "rank": return p.rank ? (p.founder ? 1000 : 0) + p.points : -1;
        case "joined": return p.joined ? new Date(p.joined).getTime() : 0;
        case "lastActive": return p.lastActive ? new Date(p.lastActive).getTime() : 0;
        default: return p[sort.key];
      }
    };
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
    });
  }, [rows, q, sort]);
  const th = (key: SortKey, label: string) => (
    <th
      className="au-sort"
      onClick={() => setSort((s0) => ({ key, dir: s0.key === key ? (s0.dir === 1 ? -1 : 1) : key === "email" || key === "side" || key === "status" ? 1 : -1 }))}
    >
      {label}
      {sort.key === key ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <div className="au-wrap">
      {err && <p className="cc-denied">⚠ {err}</p>}
      {note && <p className="cc-mini">✓ {note}</p>}
      {!rows ? (
        <p className="adm-loading">Loading users…</p>
      ) : (
        <>
          <p className="cc-mini">
            {players.length} active · {players.filter((p) => p.founder).length} Founding Officers · {others.filter((p) => p.status === "verified").length} verified, no position · {others.filter((p) => p.status === "pending").length} never entered the code · {waitlist.length} waitlist
          </p>
          <input className="cc-goal au-search" placeholder="Search players — email, side, status, rank…" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <p className="cc-mini">{shown.length} of {rows.length} match</p>}
          <div className="adm-table-wrap">
            <table className="adm-table au-table">
              <thead>
                <tr>
                  {th("email", "PLAYER")}
                  {th("side", "SIDE")}
                  {th("status", "STATUS")}
                  {th("rank", "RANK")}
                  {th("joined", "JOINED")}
                  {th("lastActive", "LAST ACTIVE")}
                  {th("held", "TILES")}
                  {th("strikes", "3×3")}
                  {th("blocks", "2×2")}
                  {th("singles", "1×1")}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.email}>
                    <td>{p.email}</td>
                    <td className={p.side ?? ""}>{p.side ? p.side.toUpperCase() : "—"}</td>
                    <td className={`au-st ${p.status}`}>{p.status === "active" ? "ACTIVE" : p.status === "verified" ? "VERIFIED" : p.status === "pending" ? "INACTIVE · no code" : "WAITLIST"}</td>
                    <td>
                      {p.rank ? (
                        <>
                          <div>{p.founder ? `★ #${p.founder} · ` : ""}{p.rank}</div>
                          <div className="au-next">{p.nextRank ? `${p.points} pts · ${p.toNext} to ${p.nextRank}` : `${p.points} pts · top rank`}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{ago(p.joined)}</td>
                    <td>{ago(p.lastActive)}</td>
                    <td>{p.held}</td>
                    {(["strikes", "blocks", "singles"] as const).map((k) => (
                      <td key={k}>
                        <span className="au-count">{p[k]}</span>
                        {p.id && (
                          <button className="au-plus" title={`Give one ${k === "strikes" ? "3×3" : k === "blocks" ? "2×2" : "1×1"}`} disabled={busy === `${p.email}-${k}`} onClick={() => grant(p, k)}>
                            +
                          </button>
                        )}
                      </td>
                    ))}
                    <td className="au-acts">
                      {p.status !== "waitlist" && (
                        <button className="cc-btn sm ghost" title="View / play as this player" disabled={busy === `as-${p.email}`} onClick={() => viewAs(p)}>
                          👁
                        </button>
                      )}
                      <button className="cc-btn sm ghost" onClick={() => { setMsgFor(p); setNote(null); }}>
                        ✉ Message
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {asLink && (
        <div className="au-msg">
          <h3 className="cc-goals-h">👁 VIEW / PLAY AS {asLink.email}</h3>
          <p className="cc-mini">
            Link copied. Paste it into a <b>private / incognito window</b> — opening it here would sign <i>this</i> browser out of your admin account.
            Anything you do there is done as them (their squares, their power-ups). Works once, expires in an hour.
          </p>
          <input className="cc-goal" readOnly value={asLink.url} onFocus={(e) => e.currentTarget.select()} />
          <div className="cc-card-acts">
            <button className="cc-btn sm ghost" onClick={() => setAsLink(null)}>Close</button>
          </div>
        </div>
      )}

      {msgFor && (
        <div className="au-msg">
          <h3 className="cc-goals-h">✉ MESSAGE {msgFor.email}</h3>
          <input className="cc-goal" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <textarea className="cc-goal" rows={6} placeholder="Your message (blank line = new paragraph)" value={message} onChange={(e) => setMessage(e.target.value)} />
          <div className="cc-card-acts">
            <button className="cc-btn sm" disabled={busy === "msg" || !subject.trim() || !message.trim()} onClick={send}>
              {busy === "msg" ? "Sending…" : "Send email"}
            </button>
            <button className="cc-btn sm ghost" onClick={() => setMsgFor(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
