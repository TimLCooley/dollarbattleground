"use client";

import { useCallback, useEffect, useState } from "react";

interface Post {
  id: number;
  goal: string | null;
  status: string;
  format: string;
  network: string | null;
  x_account: string | null;
  copy: string;
  video_kind: string | null;
  reason: string | null;
  deny_reason: string | null;
  external_id: string | null;
  replaces: number | null;
  created_at: string;
}

const DEFAULT_GOAL =
  "Build the pre-launch waitlist — get people to dollarbattleground.com and picking a side.";

export function RecruiterPanel() {
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/recruiter");
    setPosts(res.ok ? (await res.json()).posts : []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function act(action: string, extra: Record<string, unknown> = {}, tag = action) {
    setBusy(tag);
    setErr(null);
    try {
      const res = await fetch("/api/admin/recruiter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const d = await res.json();
      if (!res.ok) setErr(d.error ?? "Failed");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  function deny(id: number) {
    const reason = window.prompt("Why are you denying this post? (trains the agent)");
    if (!reason?.trim()) return;
    act("deny", { id, reason: reason.trim() }, `deny-${id}`);
  }

  const badge = (p: Post) => {
    const c = p.status === "posted" ? "#46d17a" : p.status === "denied" ? "#d23b3b" : "#f2c14e";
    return (
      <span style={{ color: c, fontWeight: 800, fontSize: 11, letterSpacing: 1 }}>
        {p.status.toUpperCase()}
      </span>
    );
  };

  return (
    <section className="rq">
      <h2 className="tl-h">◆ RECRUITER · DRAFT QUEUE</h2>
      <p className="st-note" style={{ margin: "0 0 8px" }}>
        Give the goal; the agent decides the post. Deny-only — you veto, and your reason trains it.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <textarea
          className="admx-text"
          rows={2}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          style={{ flex: 1, minWidth: 240 }}
        />
        <button className="tl-btn" onClick={() => act("draft", { goal })} disabled={busy === "draft"}>
          {busy === "draft" ? "Thinking…" : "⚡ Draft a post"}
        </button>
      </div>
      {err && <p className="ct-error">{err}</p>}

      {!posts ? (
        <p className="adm-loading">Loading…</p>
      ) : posts.length === 0 ? (
        <p className="adm-loading">No posts yet — hit “Draft a post”.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {posts.map((p) => (
            <div
              key={p.id}
              style={{
                border: "3px solid #0c3c21",
                background: "var(--ground-2)",
                padding: 12,
                opacity: p.status === "denied" ? 0.6 : 1,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13 }}>
                  {p.x_account === "blue" ? "🔵" : "🔴"} <b>{p.format.toUpperCase()}</b>
                  {p.video_kind ? ` · ${p.video_kind}` : ""}
                  {p.replaces ? ` · replaces #${p.replaces}` : ""}
                </span>
                {badge(p)}
              </div>
              <p style={{ margin: "8px 0", color: "var(--cream)", fontSize: 15 }}>{p.copy}</p>
              {p.reason && <p className="adm-dim" style={{ fontSize: 12, margin: 0 }}>💡 {p.reason}</p>}
              {p.deny_reason && (
                <p style={{ fontSize: 12, margin: "4px 0 0", color: "#ff8f8f" }}>✕ denied: {p.deny_reason}</p>
              )}
              {p.external_id && (
                <a
                  href={`https://x.com/i/status/${p.external_id}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 12, color: "#46d17a" }}
                >
                  ↗ view on X
                </a>
              )}
              {p.status === "queued" && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button
                    className="tl-btn"
                    onClick={() => act("publish", { id: p.id }, `pub-${p.id}`)}
                    disabled={busy === `pub-${p.id}`}
                  >
                    {busy === `pub-${p.id}` ? "Posting…" : "▶ Post now"}
                  </button>
                  <button
                    className="tl-btn tl-recent"
                    onClick={() => deny(p.id)}
                    disabled={busy === `deny-${p.id}`}
                  >
                    ✕ Deny
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
