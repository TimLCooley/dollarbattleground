"use client";

import { useState } from "react";

// Admin-only X (Twitter) setup + test poster. Middleware already gates /admin/*
// to admins, and every route below re-checks requireAdmin server-side.
export default function AdminXPage() {
  const [faction, setFaction] = useState<"red" | "blue">("red");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/x/test-post", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ faction, text }),
      });
      const data = await res.json();
      setStatus(res.ok ? `✅ Posted (id ${data.id})` : `⚠ ${data.error}`);
    } catch (e) {
      setStatus(`⚠ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="admx">
      <h1 className="admx-h1">X (Twitter) wiring</h1>

      <section className="admx-card">
        <h2>1. Credentials (app-per-account)</h2>
        <p>
          Each faction account owns its own X app. From that app&apos;s{" "}
          <b>Keys &amp; Tokens</b> → OAuth 1.0 Keys, grab the <b>Consumer Key</b>,
          <b> Consumer Secret</b>, and a Read-and-Write <b>Access Token</b> +{" "}
          <b>Secret</b>. They go in Vercel env as:
        </p>
        <p>
          <code>X_RED_API_KEY</code> <code>X_RED_API_SECRET</code>{" "}
          <code>X_RED_TOKEN</code> <code>X_RED_SECRET</code>
          <br />
          <code>X_BLUE_API_KEY</code> <code>X_BLUE_API_SECRET</code>{" "}
          <code>X_BLUE_TOKEN</code> <code>X_BLUE_SECRET</code>
        </p>
        <p className="admx-note">
          Make sure each app&apos;s permission is Read and Write, then regenerate
          its Access Token so it picks up the Write scope. Redeploy after adding env.
        </p>
      </section>

      <section className="admx-card">
        <h2>2. Test a post</h2>
        <p>Needs the faction tokens in env (X_RED_/X_BLUE_TOKEN + _SECRET).</p>
        <div className="admx-row">
          <button
            className={"admx-side" + (faction === "red" ? " on red" : "")}
            onClick={() => setFaction("red")}
            type="button"
          >
            🔴 Red
          </button>
          <button
            className={"admx-side" + (faction === "blue" ? " on blue" : "")}
            onClick={() => setFaction("blue")}
            type="button"
          >
            🔵 Blue
          </button>
        </div>
        <textarea
          className="admx-text"
          maxLength={280}
          rows={3}
          placeholder="Test tweet…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="admx-row">
          <span className="admx-note">{text.length}/280</span>
          <button className="admx-btn" onClick={send} disabled={busy || !text.trim()}>
            {busy ? "Posting…" : `Post as ${faction}`}
          </button>
        </div>
        {status && <p className="admx-status">{status}</p>}
      </section>

      <p className="admx-back">
        <a href="/">‹ back to the board</a>
      </p>

      <style>{`
        .admx{max-width:560px;margin:0 auto;padding:20px 16px;color:var(--cream);font-family:var(--font-hand),ui-rounded,system-ui,sans-serif}
        .admx-h1{font-family:var(--font-pixel),monospace;font-size:22px;color:var(--gold);text-align:center}
        .admx-card{background:rgba(0,0,0,.28);border:2px solid var(--mortar,#0e3f22);border-radius:10px;padding:14px 16px;margin:14px 0}
        .admx-card h2{font-family:var(--font-pixel),monospace;font-size:14px;color:var(--cream);margin:0 0 8px}
        .admx-card p{font-size:15px;color:var(--parch);margin:6px 0}
        .admx code{background:#000;color:#8ef;padding:1px 5px;border-radius:4px;font-family:ui-monospace,monospace;font-size:13px}
        .admx-btn{display:inline-block;background:var(--gold);color:#1a1a1a;font-family:var(--font-pixel),monospace;font-size:12px;padding:10px 14px;border:none;border-radius:8px;text-decoration:none;cursor:pointer}
        .admx-btn:disabled{opacity:.5}
        .admx-note{font-size:13px;color:var(--parch);opacity:.8}
        .admx-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px}
        .admx-side{flex:1;background:rgba(0,0,0,.3);border:2px solid var(--mortar,#0e3f22);color:var(--parch);font-family:var(--font-pixel),monospace;font-size:12px;padding:10px;border-radius:8px;cursor:pointer}
        .admx-side.on.red{background:var(--red);color:#fff;border-color:var(--red)}
        .admx-side.on.blue{background:var(--blue);color:#fff;border-color:var(--blue)}
        .admx-text{width:100%;box-sizing:border-box;margin-top:8px;background:#0e1a12;color:var(--cream);border:2px solid var(--mortar,#0e3f22);border-radius:8px;padding:10px;font-family:inherit;font-size:15px;resize:vertical}
        .admx-status{margin-top:8px;font-size:14px}
        .admx-back{text-align:center;margin-top:16px}
        .admx-back a{color:var(--gold)}
      `}</style>
    </main>
  );
}
