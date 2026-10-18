"use client";

import { useEffect, useState } from "react";

// Moving from dollarbattleground.com to commanderbg.com without signing anyone
// out. On the OLD domain this page parks the login + bg_* browser data under a
// one-time code and hops over; on the NEW domain it claims the code, restores
// everything, and continues to the page they asked for.
const NEW = "https://commanderbg.com";

export default function Handoff() {
  const [msg, setMsg] = useState("Moving you to commanderbg.com…");
  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const to = qs.get("to") || "/";
    const safeTo = to.startsWith("/") && !to.startsWith("//") ? to : "/";
    const code = qs.get("code");
    (async () => {
      try {
        if (!code) {
          // OLD domain: pack up and go
          const local: Record<string, string> = {};
          try {
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && k.startsWith("bg_")) local[k] = localStorage.getItem(k) ?? "";
            }
          } catch {
            /* storage blocked — the login still moves */
          }
          const r = await fetch("/api/handoff/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ local, to: safeTo }) });
          const j = (await r.json()) as { code?: string };
          window.location.replace(j.code ? `${NEW}/handoff?code=${encodeURIComponent(j.code)}` : `${NEW}${safeTo}`);
          return;
        }
        // NEW domain: claim, restore, continue
        const r = await fetch("/api/handoff/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
        const j = (await r.json().catch(() => ({}))) as { local?: Record<string, string>; to?: string };
        try {
          for (const [k, v] of Object.entries(j.local ?? {})) if (k.startsWith("bg_") && localStorage.getItem(k) === null) localStorage.setItem(k, v);
        } catch {
          /* ignore */
        }
        const dest = j.to && j.to.startsWith("/") && !j.to.startsWith("//") ? j.to : "/";
        window.location.replace(dest);
      } catch {
        setMsg("Taking you to commanderbg.com…");
        window.location.replace(code ? "/" : `${NEW}${safeTo}`);
      }
    })();
  }, []);
  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "#f6efdb", fontSize: 18 }}>
      <p>{msg}</p>
    </div>
  );
}
