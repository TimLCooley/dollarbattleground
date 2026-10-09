"use client";

import { useCallback, useEffect, useState } from "react";
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

export function AdminUsers() {
  const [rows, setRows] = useState<PlayerRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msgFor, setMsgFor] = useState<PlayerRow | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [note, setNote] = useState<string | null>(null);

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

  const players = rows?.filter((r) => !r.waitlistOnly) ?? [];
  const waitlist = rows?.filter((r) => r.waitlistOnly) ?? [];

  return (
    <div className="au-wrap">
      {err && <p className="cc-denied">⚠ {err}</p>}
      {note && <p className="cc-mini">✓ {note}</p>}
      {!rows ? (
        <p className="adm-loading">Loading users…</p>
      ) : (
        <>
          <p className="cc-mini">
            {players.length} players · {players.filter((p) => p.founder).length} Founding Officers · {waitlist.length} on the waitlist only
          </p>
          <div className="adm-table-wrap">
            <table className="adm-table au-table">
              <thead>
                <tr>
                  <th>PLAYER</th>
                  <th>SIDE</th>
                  <th>RANK</th>
                  <th>JOINED</th>
                  <th>LAST ACTIVE</th>
                  <th>TILES</th>
                  <th>3×3</th>
                  <th>2×2</th>
                  <th>1×1</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {[...players, ...waitlist].map((p) => (
                  <tr key={p.email}>
                    <td>{p.email}</td>
                    <td className={p.side ?? ""}>{p.side ? p.side.toUpperCase() : "—"}</td>
                    <td>{p.waitlistOnly ? "waitlist" : p.founder ? `★ Founder #${p.founder}` : "player"}</td>
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
                    <td>
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
